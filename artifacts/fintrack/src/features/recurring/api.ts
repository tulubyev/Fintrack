import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Transaction } from '@/features/transactions/api';

export type SeriesKind = 'subscription' | 'utility' | 'loan' | 'rent' | 'salary' | 'pension' | 'trial' | 'other';
export type SeriesStatus = 'detected' | 'confirmed' | 'ignored' | 'cancelled' | 'ended';
export type Periodicity = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RecurringSeries {
  id: string;
  displayName: string;
  kind: SeriesKind;
  direction: 'in' | 'out';
  source: string;
  service: { code: string; name: string; group: string; cancelUrl: string | null; cancelSteps: string | null; verified: boolean } | null;
  accountId: string | null;
  categoryId: string | null;
  currency: string;
  periodicity: Periodicity;
  amountLast: string;
  expectedAmount: string | null;
  monthlyEquivalent: string;
  yearlyEquivalent: string;
  nextExpectedDate: string | null;
  lastDate: string;
  firstDate: string;
  occurrences: number;
  confidence: number;
  status: SeriesStatus;
  remindDaysBefore: number;
  priceChange: { from: string; to: string; date: string } | null;
  overlapGroup: string | null;
  cancelledAt: string | null;
}

export interface Overlap {
  group: string;
  label: string;
  seriesIds: string[];
}

export interface RecurringList {
  items: RecurringSeries[];
  totals: { monthly: string; yearly: string; count: number; mandatoryMonthly: string; incomeMonthly: string; newCount: number };
  overlaps: Overlap[];
}

export interface SeriesPatch {
  displayName?: string;
  kind?: SeriesKind;
  categoryId?: string | null;
  remindDaysBefore?: number;
  status?: 'confirmed' | 'ignored' | 'cancelled';
}

const keys = {
  all: ['v1', 'recurring'] as const,
  list: ['v1', 'recurring', 'list'] as const,
  one: (id: string) => ['v1', 'recurring', 'one', id] as const,
};

// экран делит серии по вкладкам сам: один запрос со всеми видимыми статусами
const VISIBLE: SeriesStatus[] = ['detected', 'confirmed', 'cancelled', 'ended'];

export const useRecurring = () =>
  useQuery({
    queryKey: keys.list,
    queryFn: () => api<RecurringList>('/api/v1/recurring', { query: { status: VISIBLE.join(',') } }),
    staleTime: 30_000,
  });

export const useSeries = (id: string | null) =>
  useQuery({
    queryKey: keys.one(id ?? ''),
    queryFn: () => api<RecurringSeries & { transactions: Transaction[] }>(`/api/v1/recurring/${id}`),
    enabled: Boolean(id),
  });

export function useUpdateSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: SeriesPatch & { id: string }) => api<RecurringSeries>(`/api/v1/recurring/${id}`, { method: 'PATCH', body: patch }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useCreateManualSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { transactionIds: string[]; displayName?: string }) => api<RecurringSeries>('/api/v1/recurring', { method: 'POST', body }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDetect() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ queued: boolean }>('/api/v1/recurring/detect', { method: 'POST' }),
    // без воркера поиск проходит сразу, с воркером — через несколько секунд
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.all });
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: keys.all }), 5_000);
    },
  });
}

// ---------- тексты ----------

export const MANDATORY_KINDS: SeriesKind[] = ['utility', 'loan', 'rent'];

export const KIND_LABELS: Record<SeriesKind, string> = {
  subscription: 'Подписка',
  utility: 'ЖКУ и связь',
  loan: 'Кредит',
  rent: 'Аренда',
  salary: 'Зарплата',
  pension: 'Пенсия',
  trial: 'Пробный период',
  other: 'Другое',
};

const PERIOD_LABELS: Record<Periodicity, string> = {
  weekly: 'каждую неделю',
  biweekly: 'раз в две недели',
  monthly: 'каждый месяц',
  quarterly: 'раз в квартал',
  yearly: 'раз в год',
};

const WEEKDAYS = ['в воскресенье', 'в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу'];

/** «каждый месяц, 20-го», «каждую неделю, в пятницу», «раз в год» */
export function scheduleText(series: Pick<RecurringSeries, 'periodicity' | 'nextExpectedDate' | 'lastDate'>): string {
  const base = PERIOD_LABELS[series.periodicity];
  const anchor = series.nextExpectedDate ?? series.lastDate;
  if (series.periodicity === 'monthly' || series.periodicity === 'quarterly') return `${base}, ${Number(anchor.slice(8, 10))}-го`;
  if (series.periodicity === 'weekly' || series.periodicity === 'biweekly') {
    const [y, m, d] = anchor.split('-').map(Number);
    return `${base}, ${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}`;
  }
  return base;
}

/** Дней от today до date (оба YYYY-MM-DD). */
export function daysUntil(date: string, today: string): number {
  const toUtc = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((toUtc(date) - toUtc(today)) / 86_400_000);
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «сегодня», «завтра», «через 3 дня», «просрочено на 2 дня» */
export function whenText(days: number): string {
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  if (days > 1) return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
  return `ожидалось ${-days} ${plural(-days, 'день', 'дня', 'дней')} назад`;
}

export const paymentsWord = (n: number) => plural(n, 'регулярный платёж', 'регулярных платежа', 'регулярных платежей');
