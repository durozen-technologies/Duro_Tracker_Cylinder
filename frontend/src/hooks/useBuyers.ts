import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Buyer, BuyerCreate, BuyerUpdate } from '../types/api';

export function useBuyers() {
  return useQuery({
    queryKey: ['buyers'],
    queryFn: async () => {
      const response = await api.get<Buyer[]>('/admin/buyers');
      return response.data;
    }
  });
}

export function useCreateBuyer() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: any) => {
      const response = await api.post<Buyer>('/admin/buyers', data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] });
      queryClient.invalidateQueries({ queryKey: ['buyers', 'bills'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // Invalidate specific buyer ledger if it was an update
      if (typeof variables === 'object' && variables !== null && 'id' in variables) {
        queryClient.invalidateQueries({ queryKey: ['buyers', variables.id, 'ledger'] });
      }
    }
  });
}

export function useUpdateBuyer() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, data }: { id: string, data: BuyerUpdate }) => {
      const response = await api.put<Buyer>(`/admin/buyers/${id}`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] });
      queryClient.invalidateQueries({ queryKey: ['buyers', 'bills'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // Invalidate specific buyer ledger if it was an update
      if (typeof variables === 'object' && variables !== null && 'id' in variables) {
        queryClient.invalidateQueries({ queryKey: ['buyers', variables.id, 'ledger'] });
      }
    }
  });
}

export function useDeleteBuyer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/buyers/${id}`);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] });
      queryClient.invalidateQueries({ queryKey: ['buyers', 'bills'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (typeof variables === 'string') {
        queryClient.invalidateQueries({ queryKey: ['buyers', variables, 'ledger'] });
      }
    }
  });
}

export interface GlobalBill {
  id: string;
  bill_number?: string;
  time: string;
  buyer: string;
  fullGiven: number;
  emptyCollected: number;
  total: number;
}

export function useGlobalBillsPaginated(billType: 'ALL' | 'SALES' | 'COLLECTIONS' = 'ALL') {
  return useInfiniteQuery({
    queryKey: ['buyers', 'bills', 'paginated', billType],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params: any = {
        paginated: true, 
        cursor: pageParam, 
        limit: 20
      };
      if (billType === 'SALES') params.bill_type = 'sales';
      if (billType === 'COLLECTIONS') params.bill_type = 'collections';

      const res = await api.get('/driver/entries', { params });
      return res.data;
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}

export function useGlobalBills() {
  return useQuery({
    queryKey: ['buyers', 'bills'],
    queryFn: async () => {
      const response = await api.get<GlobalBill[]>('/admin/buyers/bills');
      return response.data;
    }
  });
}

export interface LedgerEntry {
  id: string;
  bill_number?: string;
  date: string;
  type: string;
  fullGiven: number;
  emptyCollected: number;
  amount: number;
  paid: number;
  finRunBal: number;
  cylRunBal: number;
}

export interface PaginatedLedgerResponse {
  items: LedgerEntry[];
  next_cursor: string | null;
}

export function useBuyerLedger(buyerId?: string) {
  return useInfiniteQuery({
    queryKey: ['buyers', buyerId, 'ledger'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      if (!buyerId) return { items: [], next_cursor: null };
      const response = await api.get<PaginatedLedgerResponse>(`/admin/buyers/${buyerId}/ledger`, {
        params: { cursor: pageParam, limit: 20 }
      });
      return response.data;
    },
    getNextPageParam: (lastPage) => lastPage.next_cursor || undefined,
    enabled: !!buyerId,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}
