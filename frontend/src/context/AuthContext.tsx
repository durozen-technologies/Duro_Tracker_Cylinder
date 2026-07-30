import React, { createContext, useContext, useState, useEffect } from 'react';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import { useQueryClient } from '@tanstack/react-query';

export type UserRole = 'super_admin' | 'tenant_admin' | 'driver';

interface AuthContextData {
  userToken: string | null;
  userRole: UserRole | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userToken, setUserToken] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const queryClient = useQueryClient();

  // Create the logout function early so we can use it in the useEffect listener
  const logout = async () => {
    try {
      await AsyncStorage.removeItem('@auth_token');
      queryClient.clear();
      setUserToken(null);
      setUserRole(null);
    } catch (e) {
      console.error("Failed to logout", e);
    }
  };

  useEffect(() => {
    const bootstrapAsync = async () => {
      try {
        const token = await AsyncStorage.getItem('@auth_token');
        if (token) {
          const decoded = jwtDecode<{ role: UserRole }>(token);
          setUserToken(token);
          setUserRole(decoded.role);
        }
      } catch (e) {
        console.error("Failed to restore token", e);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrapAsync();

    // Listen for 401 Unauthorized errors from the API Client
    const subscription = DeviceEventEmitter.addListener('onTokenExpired', () => {
      logout();
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const login = async (token: string) => {
    try {
      await AsyncStorage.setItem('@auth_token', token);
      const decoded = jwtDecode<{ role: UserRole }>(token);
      queryClient.clear(); // Ensure we don't leak old user's cache
      setUserToken(token);
      setUserRole(decoded.role);
    } catch (e) {
      console.error("Failed to login", e);
    }
  };



  return (
    <AuthContext.Provider value={{ userToken, userRole, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
