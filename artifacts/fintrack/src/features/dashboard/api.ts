import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { BudgetStatus } from '@/features/budgets/api';
import type { Goal } from '@/features/goals/api';

export interface DashboardSummary {
  month: string;
  asOf: string;
  balance: {
    totalRub: string;
    byCurrency: { currency: string; amount: string; amountRub: string | null }[];
    currenciesWithoutRate: string[];
    accountsCount: number;
  };
  period: {
    from: string;
    to: string;
    income: string;
    expense: string;
    net: string;
    expensePrevSamePeriod: string;
    expenseDeltaPct: number | null;
    daysPassed: number;
    daysInMonth: number;
  };
  topCategories: {
    items: { categoryId: string | null; name: string; icon: string | null; color: string | null; amount: string; share: number; deltaPct: number | null }[];
    other: { amount: string; share: number } | null;
    total: string;
  };
  budgets: { count: number; over: number; warning: number; top: BudgetStatus[] } | null;
  upcoming: {
    items: { seriesId: string; name: string; kind: string; amount: string; currency: string; date: string; accountId: string | null }[];
    total: string;
    days: number;
  };
  goals: Goal[];
  uncategorizedCount: number;
  freshness: { accountId: string; name: string; lastTransactionDate: string | null; source: string; stale: boolean }[];
  onboarding: { hasAccount: boolean; hasTransactions: boolean; txCount: number; hasBudget: boolean; dismissed: boolean };
}

export interface SpendingPoint {
  key: string | null;
  label: string | null;
  icon: string | null;
  color: string | null;
  amount: string;
  count: number;
}

// под ['v1', 'dashboard'] и ['v1', 'analytics'] — их сбрасывает любая правка операций (useInvalidateLedger)
export const useDashboard = () =>
  // staleTime 0: при каждом открытии главной показываем кеш и сразу обновляем — бюджеты, цели и подписки меняются на других экранах
  useQuery({ queryKey: ['v1', 'dashboard', 'summary'], queryFn: () => api<DashboardSummary>('/api/v1/dashboard/summary'), staleTime: 0 });

export const useSpending = (params: { from: string; to: string; groupBy: 'day' | 'week' | 'month' | 'parent_category' }) =>
  useQuery({
    queryKey: ['v1', 'analytics', 'spending', params],
    queryFn: () => api<{ items: SpendingPoint[]; total: string }>('/api/v1/analytics/spending', { query: params }),
    staleTime: 60_000,
  });

export function useDismissOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/api/v1/dashboard/onboarding/dismiss', { method: 'POST' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['v1', 'dashboard'] }),
  });
}

// ---------- даты ----------

export const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
};
export const daysInMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
export const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
