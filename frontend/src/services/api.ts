import axios from 'axios';
import axiosRetry from 'axios-retry';

import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});


// Configure Exponential Backoff for Network Errors and 5xx
axiosRetry(api, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 500;
  }
});

// Request Interceptor: Inject JWT and Idempotency Keys
api.interceptors.request.use(async (config) => {
  try {
    const token = await AsyncStorage.getItem('@auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.error("Error reading token:", error);
  }

  // Auto-inject X-Idempotency-Key for POST/PUT/PATCH/DELETE
  if (config.method && ['post', 'put', 'patch', 'delete'].includes(config.method.toLowerCase())) {
    if (!config.headers['X-Idempotency-Key']) {
      config.headers['X-Idempotency-Key'] = Date.now().toString(36) + Math.random().toString(36).substring(2);
    }
  }

  return config;
}, (error) => {
  return Promise.reject(error);
});

import { Alert, DeviceEventEmitter } from 'react-native';

// Response Interceptor: Handle 401 Unauthorized and Concurrency Errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Clear token and emit event to force AuthContext to logout
      await AsyncStorage.removeItem('@auth_token');
      DeviceEventEmitter.emit('onTokenExpired');
    } else if (error.response?.status === 423) {
      Alert.alert("Transaction Locked", error.response.data.detail || "This record is currently being updated by another process. Please try again in a moment.");
    } else if (error.response?.status === 409 || error.response?.status === 422) {
      Alert.alert("Transaction Failed", error.response.data.detail || "An integrity error occurred.");
    }
    return Promise.reject(error);
  }
);

// Super Admin Endpoints
export const superAdminApi = {
  getOrganizations: async () => {
    const response = await api.get('/super-admin/organizations');
    return response.data;
  },
  createOrganization: async (data: { name: string; max_users: number }) => {
    const response = await api.post('/super-admin/organizations', data);
    return response.data;
  },
  createTenantAdmin: async (orgId: string, data: any) => {
    const response = await api.post(`/super-admin/organizations/${orgId}/admins`, data);
    return response.data;
  },
  getStats: async () => {
    const response = await api.get('/super-admin/stats');
    return response.data;
  },
  getOrganizationUsers: async (orgId: string) => {
    const response = await api.get(`/super-admin/organizations/${orgId}/users`);
    return response.data;
  },
  updateOrganization: async (orgId: string, data: { name?: string; max_users?: number }) => {
    const response = await api.put(`/super-admin/organizations/${orgId}`, data);
    return response.data;
  },
  deleteOrganization: async (orgId: string) => {
    const response = await api.delete(`/super-admin/organizations/${orgId}`);
    return response.data;
  },
  updateOrganizationUser: async (orgId: string, userId: string, data: { password?: string; is_active?: boolean }) => {
    const response = await api.put(`/super-admin/organizations/${orgId}/users/${userId}`, data);
    return response.data;
  },
  deleteOrganizationUser: async (orgId: string, userId: string) => {
    const response = await api.delete(`/super-admin/organizations/${orgId}/users/${userId}`);
    return response.data;
  }
};

export const adminReportsApi = {
  getPurchasePdfUrl: (dateMode: string, startDate?: string, endDate?: string, providerIds?: string) => {
    const params = new URLSearchParams();
    params.append('date_mode', dateMode);
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    if (providerIds) params.append('provider_ids', providerIds);
    return `${API_BASE_URL}/admin/reports/purchases/pdf?${params.toString()}`;
  }
};
