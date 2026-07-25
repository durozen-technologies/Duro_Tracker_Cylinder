import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Driver } from '../types/api';

export function useDrivers() {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: async () => {
      const response = await api.get<Driver[]>('/admin/drivers');
      return response.data;
    }
  });
}

export function useOrganization() {
  return useQuery({
    queryKey: ['organization'],
    queryFn: async () => {
      const response = await api.get('/admin/organization');
      return response.data;
    }
  });
}

export function useDriverOrganization() {
  return useQuery({
    queryKey: ['driver_organization'],
    queryFn: async () => {
      const response = await api.get('/driver/organization');
      return response.data;
    }
  });
}

export function useToggleDriver() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string, isActive: boolean }) => {
      const response = await api.put<Driver>(`/admin/drivers/${id}`, { is_active: isActive });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    }
  });
}

export function useCreateDriver() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post<Driver>('/admin/drivers', { ...data, role: 'driver' });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
    }
  });
}

