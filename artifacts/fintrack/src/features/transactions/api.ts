import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type TransactionType = 'expense' | 'income' | 'transfer' | 'adjustment';

export interface Transaction {
  id: string;
  accountId: string;
  type: TransactionType;
  status: string;
  amount: string;
  currency: string;
  amountRub: string | null;
  date: string;
  time: string | null;
  categoryId: string | null;
  merchant: string | null;
  description: string;
  note: string | null;
  transferGroupId: string | null;
  transferCounterpartAccountId: string | null;
  source: string;
  excludeFromStats: boolean;
}

/** Фильтры ленты; те же параметры понимают /transactions и /transactions/summary. */
export interface TransactionFilters {
  accountId?: string[];
  categoryId?: string[];
  type?: TransactionType[];
  from?: string;
  to?: string;
  q?: string;
  uncategorized?: boolean;
}

export interface CategoryNode {
  id: string;
  code: string | null;
  name: string;
  kind: 'expense' | 'income' | 'transfer';
  icon: string | null;
  color: string | null;
  isSystem: boolean;
  hidden: boolean;
  children: CategoryNode[];
}

export interface FlatCategory {
  id: string;
  name: string;
  kind: CategoryNode['kind'];
  icon: string | null;
  color: string | null;
  parentId: string | null;
  /** «Транспорт · Такси» для подкатегории */
  fullName: string;
}

const toQuery = (filters: TransactionFilters) => ({
  ...filters,
  uncategorized: filters.uncategorized ? 'true' : undefined,
});

export function useCategories() {
  return useQuery({
    queryKey: ['v1', 'categories'],
    queryFn: () => api<{ items: CategoryNode[] }>('/api/v1/categories'),
    staleTime: 5 * 60_000,
    select: (data) => {
      const flat = new Map<string, FlatCategory>();
      for (const parent of data.items) {
        flat.set(parent.id, { id: parent.id, name: parent.name, kind: parent.kind, icon: parent.icon, color: parent.color, parentId: null, fullName: parent.name });
        for (const child of parent.children) {
          flat.set(child.id, {
            id: child.id, name: child.name, kind: child.kind, icon: child.icon ?? parent.icon, color: child.color ?? parent.color,
            parentId: parent.id, fullName: `${parent.name} · ${child.name}`,
          });
        }
      }
      return { tree: data.items, byId: flat };
    },
  });
}

export function useTransactionFeed(filters: TransactionFilters, pageSize = 50) {
  return useInfiniteQuery({
    queryKey: ['v1', 'transactions', 'feed', filters],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<{ items: Transaction[]; nextCursor: string | null }>('/api/v1/transactions', { query: { ...toQuery(filters), limit: pageSize, cursor: pageParam } }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });
}

export function useTransactionSummary(filters: TransactionFilters) {
  return useQuery({
    queryKey: ['v1', 'transactions', 'summary', filters],
    queryFn: () => api<{ count: number; income: string; expense: string; net: string }>('/api/v1/transactions/summary', { query: toQuery(filters) }),
    staleTime: 30_000,
  });
}

/** Операции меняют остатки: вместе с лентой устаревают счета. */
function useInvalidateLedger() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['v1', 'transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['v1', 'accounts'] }),
  ]);
}

export interface TransactionPatch {
  categoryId?: string | null;
  merchant?: string | null;
  note?: string | null;
  excludeFromStats?: boolean;
  amount?: string;
  date?: string;
  type?: 'expense' | 'income';
  accountId?: string;
}

export function useUpdateTransaction() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TransactionPatch }) => api<Transaction>(`/api/v1/transactions/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });
}

export type BulkAction = 'set_category' | 'delete' | 'exclude' | 'include';

export function useBulkUpdate() {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: { ids: string[]; action: BulkAction; categoryId?: string }) =>
      api<{ updated: number }>('/api/v1/transactions/bulk', { method: 'POST', body }),
    onSuccess: invalidate,
  });
}
