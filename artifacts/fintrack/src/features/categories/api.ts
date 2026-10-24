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

// ─── Правила категоризации (E1.3-T9) ───────────────────────────────────────

export type RuleField = 'merchant' | 'description' | 'mcc';
export type RuleOp = 'equals' | 'contains' | 'starts_with';

export interface CategoryRule {
  id: string;
  field: RuleField;
  op: RuleOp;
  pattern: string;
  categoryId: string;
  accountId: string | null;
  direction: 'in' | 'out' | null;
  renameMerchantTo: string | null;
  priority: number;
  source: 'correction' | 'manual';
  hitCount: number;
  createdAt: string;
}

export interface RuleInput {
  field: RuleField;
  op: RuleOp;
  pattern: string;
  categoryId: string;
  direction: 'in' | 'out';
}

const KEY_RULES = ['v1', 'category-rules'];

export const useRules = () =>
  useQuery({ queryKey: KEY_RULES, queryFn: () => api<{ items: CategoryRule[]; nextCursor: string | null }>('/api/v1/category-rules', { query: { limit: '200' } }) });

function useInvalidateRules() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: KEY_RULES }),
    // «и прошлые» перекатегоризирует операции — устаревают лента, бюджеты и главная
    queryClient.invalidateQueries({ queryKey: ['v1', 'transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['v1', 'budgets'] }),
    queryClient.invalidateQueries({ queryKey: ['v1', 'dashboard'] }),
    queryClient.invalidateQueries({ queryKey: ['v1', 'analytics'] }),
  ]);
}

export function useCreateRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: (input: RuleInput & { apply: 'future' | 'future_and_past' }) =>
      api<{ rule: CategoryRule; affectedCount: number }>('/api/v1/category-rules', { method: 'POST', body: input }),
    onSuccess: invalidate,
  });
}

export function useUpdateRule() {
  const invalidate = useInvalidateRules();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<RuleInput> & { id: string; apply: 'future' | 'future_and_past' }) =>
      api<CategoryRule & { affectedCount: number }>(`/api/v1/category-rules/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: invalidate,
  });
}

export function useDeleteRule() {
  const invalidate = useInvalidateRules();
  return useMutation({ mutationFn: (id: string) => api<void>(`/api/v1/category-rules/${id}`, { method: 'DELETE' }), onSuccess: invalidate });
}

/** Сколько операций подходит под условие (без ручных и переводов). */
export const useRulePreview = (input: Pick<RuleInput, 'field' | 'op' | 'pattern' | 'direction'> | null) =>
  useQuery({
    queryKey: ['v1', 'category-rules', 'preview', input],
    queryFn: () => api<{ matchCount: number }>('/api/v1/category-rules/preview', { method: 'POST', body: input }),
    enabled: Boolean(input),
    staleTime: 10_000,
  });
