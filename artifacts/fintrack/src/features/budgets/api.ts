import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { todayIso } from '@/lib/money';

export type BudgetState = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  id: string;
  categoryId: string | null;
  category: { name: string; icon: string | null; color: string | null } | null;
  amount: string;
  /** Лимит месяца с переносом остатка */
  effectiveAmount: string;
  spent: string;
  remaining: string;
  percent: number;
  expectedByToday: string;
  status: BudgetState;
  rollover: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  excludedCategoryIds: string[];
  alertThresholds: number[];
  children?: BudgetStatus[];
}

export interface BudgetsMonth {
  month: string;
  items: BudgetStatus[];
  total: { amount: string; spent: string; remaining: string };
  unbudgetedSpent: string;
}

export interface BudgetSuggestion {
  categoryId: string;
  median3m: string;
  suggestedAmount: string;
}

export interface BudgetDaily {
  month: string;
  budgetId: string;
  amount: string;
  daysInMonth: number;
  days: { date: string; spent: string; cumulative: string }[];
}

export interface BudgetInput {
  id?: string;
  categoryId: string | null;
  amount: string;
  rollover?: boolean;
  fromMonth?: string;
  excludedCategoryIds?: string[];
}

export interface BudgetPatch {
  amount?: string;
  rollover?: boolean;
  excludedCategoryIds?: string[];
  fromMonth?: string;
}

// ---------- месяцы ----------

export const currentMonth = () => todayIso().slice(0, 7);

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export const daysInMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/** «2026-10» → «Октябрь 2026» */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
}

const GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const PREPOSITIONAL = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

/** «2026-11» → «ноября»: «Удалить с ноября» */
export const monthGenitive = (month: string) => GENITIVE[Number(month.slice(5, 7)) - 1];

/** «2026-10» → «октябре»: «Удалить уже в октябре» */
export const monthPrepositional = (month: string) => PREPOSITIONAL[Number(month.slice(5, 7)) - 1];

export const isMonth = (value: string | null): value is string => Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));

// ---------- запросы ----------

const keys = {
  all: ['v1', 'budgets'] as const,
  month: (month: string) => ['v1', 'budgets', 'month', month] as const,
  suggestions: ['v1', 'budgets', 'suggestions'] as const,
  daily: (id: string, month: string) => ['v1', 'budgets', 'daily', id, month] as const,
};

export const useBudgets = (month: string) =>
  useQuery({ queryKey: keys.month(month), queryFn: () => api<BudgetsMonth>('/api/v1/budgets', { query: { month } }), staleTime: 30_000 });

export const useBudgetSuggestions = (enabled: boolean) =>
  useQuery({ queryKey: keys.suggestions, queryFn: () => api<BudgetSuggestion[]>('/api/v1/budgets/suggestions'), enabled, staleTime: 5 * 60_000 });

export const useBudgetDaily = (id: string | null, month: string) =>
  useQuery({
    queryKey: keys.daily(id ?? '', month),
    queryFn: () => api<BudgetDaily>(`/api/v1/budgets/${id}/daily`, { query: { month } }),
    enabled: Boolean(id),
    staleTime: 30_000,
  });

function useInvalidateBudgets() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

export function useCreateBudget() {
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: (input: BudgetInput) => api<BudgetStatus>('/api/v1/budgets', { method: 'POST', body: input }),
    onSettled: invalidate,
  });
}

export function useCreateBudgets() {
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: (input: { items: { categoryId: string; amount: string }[]; fromMonth?: string }) =>
      api<{ created: BudgetStatus[] }>('/api/v1/budgets/bulk', { method: 'POST', body: input }),
    onSettled: invalidate,
  });
}

export function useUpdateBudget() {
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: ({ id, ...patch }: BudgetPatch & { id: string }) => api<BudgetStatus>(`/api/v1/budgets/${id}`, { method: 'PATCH', body: patch }),
    onSettled: invalidate,
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fromMonth }: { id: string; fromMonth: string }) =>
      api<void>(`/api/v1/budgets/${id}`, { method: 'DELETE', query: { fromMonth } }),
    // график удалённого бюджета не перезапрашиваем: в этом месяце его может уже не быть (404)
    onSettled: (_data, _error, { id }) => queryClient.invalidateQueries({
      queryKey: keys.all,
      predicate: (query) => !(query.queryKey[2] === 'daily' && query.queryKey[3] === id),
    }),
  });
}
