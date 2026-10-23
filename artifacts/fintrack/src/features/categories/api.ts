import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CategoryNode } from '@/features/transactions/api';

// под ['v1', 'categories'] — правки сбрасывают и выбор категории во всех формах (useCategories)
const KEY_ALL = ['v1', 'categories', 'all'];

/** Дерево вместе со скрытыми — для экрана управления. */
export const useAllCategories = () =>
  useQuery({ queryKey: KEY_ALL, queryFn: () => api<{ items: CategoryNode[] }>('/api/v1/categories', { query: { includeHidden: 'true' } }) });

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['v1', 'categories'] }),
    // переименование и удаление видны в операциях, бюджетах и на главной
    queryClient.invalidateQueries({ queryKey: ['v1', 'transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['v1', 'budgets'] }),
    queryClient.invalidateQueries({ queryKey: ['v1', 'dashboard'] }),
  ]);
}

export interface CategoryInput {
  name: string;
  kind: 'expense' | 'income';
  parentId: string | null;
}

export function useCreateCategory() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: CategoryInput) => api<CategoryNode>('/api/v1/categories', { method: 'POST', body: input }), onSettled: invalidate });
}

export function useUpdateCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; parentId?: string | null; hidden?: boolean; customName?: string | null }) =>
      api<CategoryNode>(`/api/v1/categories/${id}`, { method: 'PATCH', body: patch }),
    onSettled: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, replaceWithId }: { id: string; replaceWithId: string }) =>
      api<{ movedTransactions: number; movedBudgets: number; removedBudgets: number }>(`/api/v1/categories/${id}`, { method: 'DELETE', body: { replaceWithId } }),
    onSettled: invalidate,
  });
}

export interface CategorySettings {
  llm: boolean;
  /** Нейросеть включена на сервере (решение D2); иначе настройка не показывается. */
  llmAvailable: boolean;
}

const KEY_SETTINGS = ['v1', 'categories', 'settings'];

export const useCategorySettings = () =>
  useQuery({ queryKey: KEY_SETTINGS, queryFn: () => api<CategorySettings>('/api/v1/categories/settings') });

export function useUpdateCategorySettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (llm: boolean) => api<CategorySettings>('/api/v1/categories/settings', { method: 'PATCH', body: { llm } }),
    onSuccess: (data) => queryClient.setQueryData(KEY_SETTINGS, data),
  });
}
