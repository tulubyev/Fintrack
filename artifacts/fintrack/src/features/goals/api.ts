import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Goal {
  id: string;
  name: string;
  description: string | null;
  targetAmount: string;
  currentAmount: string;
  percent: number;
  targetDate: string | null;
  accountId: string | null;
  countOnlyNewMoney: boolean;
  /** Когда цель будет достигнута при текущем темпе; null — не будет (прирост ≤ 0) или уже достигнута */
  forecastDate: string | null;
  /** Сколько откладывать в месяц, чтобы успеть к сроку */
  monthlyNeeded: string | null;
  avgMonthlyGrowth: string;
  onTrack: boolean | null;
  completedAt: string | null;
  archivedAt: string | null;
  icon: string | null;
  color: string | null;
  createdAt: string | null;
}

export interface Contribution {
  id: string;
  amount: string;
  date: string;
  note: string | null;
  transactionId: string | null;
  createdAt: string;
}

export interface GoalInput {
  id?: string;
  name: string;
  targetAmount: string;
  targetDate?: string | null;
  accountId?: string | null;
  countOnlyNewMoney?: boolean;
  initialAmount?: string;
  icon?: string | null;
  description?: string | null;
}

export type GoalPatch = Partial<Omit<GoalInput, 'id' | 'initialAmount'>>;

const keys = {
  all: ['v1', 'goals'] as const,
  list: (includeArchived: boolean) => ['v1', 'goals', 'list', { includeArchived }] as const,
  contributions: (id: string) => ['v1', 'goals', 'contributions', id] as const,
};

export const useGoals = (includeArchived: boolean) =>
  useQuery({
    queryKey: keys.list(includeArchived),
    queryFn: () => api<{ items: Goal[] }>('/api/v1/goals', { query: { includeArchived } }),
    staleTime: 30_000,
  });

export function useContributions(goalId: string | null) {
  return useInfiniteQuery({
    queryKey: keys.contributions(goalId ?? ''),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api<{ items: Contribution[]; nextCursor: string | null }>(`/api/v1/goals/${goalId}/contributions`, { query: { limit: 20, cursor: pageParam } }),
    getNextPageParam: (last) => last.nextCursor,
    enabled: Boolean(goalId),
  });
}

function useInvalidateGoals() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: keys.all });
}

export function useCreateGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({ mutationFn: (input: GoalInput) => api<Goal>('/api/v1/goals', { method: 'POST', body: input }), onSettled: invalidate });
}

export function useUpdateGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: ({ id, ...patch }: GoalPatch & { id: string }) => api<Goal>(`/api/v1/goals/${id}`, { method: 'PATCH', body: patch }),
    onSettled: invalidate,
  });
}

export function useArchiveGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api<Goal>(`/api/v1/goals/${id}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' }),
    onSettled: invalidate,
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidateGoals();
  return useMutation({ mutationFn: (id: string) => api<void>(`/api/v1/goals/${id}`, { method: 'DELETE' }), onSettled: invalidate });
}

export function useAddContribution() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: ({ goalId, ...body }: { goalId: string; id?: string; amount: string; date?: string; note?: string | null }) =>
      api<{ contribution: Contribution; goal: Goal }>(`/api/v1/goals/${goalId}/contributions`, { method: 'POST', body }),
    onSettled: invalidate,
  });
}

export function useDeleteContribution() {
  const invalidate = useInvalidateGoals();
  return useMutation({
    mutationFn: ({ goalId, id }: { goalId: string; id: string }) => api<void>(`/api/v1/goals/${goalId}/contributions/${id}`, { method: 'DELETE' }),
    onSettled: invalidate,
  });
}

// ---------- тексты ----------

const DATIVE = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю'];

/** «2027-08-19» → «августу 2027»: «При текущем темпе: к августу 2027» */
export function monthDative(iso: string): string {
  return `${DATIVE[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** Значки целей — имена lucide; сервер принимает латиницу, цифры и дефис */
export const GOAL_ICONS = ['piggy-bank', 'plane', 'car', 'house', 'graduation-cap', 'gift', 'smartphone', 'heart-pulse', 'baby', 'shield'] as const;
