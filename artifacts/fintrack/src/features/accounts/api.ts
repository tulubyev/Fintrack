import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const ACCOUNT_KINDS = [
  'debit_card', 'credit_card', 'current', 'cash', 'savings', 'deposit', 'loan', 'brokerage', 'iis', 'digital_ruble', 'other',
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const KIND_LABELS: Record<AccountKind, string> = {
  debit_card: 'Дебетовая карта',
  credit_card: 'Кредитная карта',
  current: 'Текущий счёт',
  cash: 'Наличные',
  savings: 'Накопительный счёт',
  deposit: 'Вклад',
  loan: 'Кредит',
  brokerage: 'Брокерский счёт',
  iis: 'ИИС',
  digital_ruble: 'Цифровой рубль',
  other: 'Другое',
};

export const CURRENCIES = ['RUB', 'USD', 'EUR', 'CNY', 'GBP', 'KZT', 'BYN', 'TRY', 'AED'] as const;

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  institutionCode: string | null;
  currency: string;
  balance: string;
  balanceRub: string | null;
  openingBalance: string;
  openingBalanceDate: string | null;
  lastFour: string | null;
  creditLimit: string | null;
  includeInTotal: boolean;
  source: string;
  archivedAt: string | null;
  lastTransactionDate: string | null;
}

export interface AccountsList {
  items: Account[];
  totals: { balanceRub: string; byCurrency: { currency: string; balance: string }[]; currenciesWithoutRate: string[] };
}

export interface Institution {
  code: string;
  name: string;
  importFormats: string[];
}

export interface AccountInput {
  id?: string;
  name: string;
  kind: AccountKind;
  institutionCode: string | null;
  currency: string;
  openingBalance: string;
  openingBalanceDate: string | null;
  lastFour: string | null;
  includeInTotal: boolean;
}

export interface Transaction {
  id: string;
  accountId: string;
  type: 'expense' | 'income' | 'transfer' | 'adjustment' | string;
  status: string;
  amount: string;
  currency: string;
  date: string;
  time: string | null;
  merchant: string | null;
  description: string;
  note: string | null;
  transferCounterpartAccountId: string | null;
  excludeFromStats: boolean;
}

const keys = {
  accounts: (includeArchived: boolean) => ['v1', 'accounts', { includeArchived }] as const,
  account: (id: string) => ['v1', 'accounts', id] as const,
  institutions: ['v1', 'institutions'] as const,
};

export const useAccounts = (includeArchived = false) =>
  useQuery({ queryKey: keys.accounts(includeArchived), queryFn: () => api<AccountsList>('/api/v1/accounts', { query: { includeArchived } }), staleTime: 30_000 });

export const useAccount = (id: string) =>
  useQuery({ queryKey: keys.account(id), queryFn: () => api<Account>(`/api/v1/accounts/${id}`), staleTime: 30_000 });

export const useInstitutions = () =>
  useQuery({ queryKey: keys.institutions, queryFn: () => api<Institution[]>('/api/v1/institutions'), staleTime: Infinity });

export const useAccountTransactions = (accountId: string) =>
  useQuery({
    queryKey: ['v1', 'transactions', { accountId }],
    queryFn: () => api<{ items: Transaction[]; nextCursor: string | null }>('/api/v1/transactions', { query: { accountId: [accountId], limit: 50 } }),
    staleTime: 30_000,
  });

/** После любой правки счёта или операций: списки счетов, карточки и ленты устаревают вместе. */
function useInvalidateLedger() {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['v1', 'accounts'] }),
    queryClient.invalidateQueries({ queryKey: ['v1', 'transactions'] }),
  ]);
}

export function useCreateAccount() {
  const invalidate = useInvalidateLedger();
  return useMutation({ mutationFn: (input: AccountInput) => api<Account>('/api/v1/accounts', { method: 'POST', body: input }), onSuccess: invalidate });
}

export function useUpdateAccount(id: string) {
  const invalidate = useInvalidateLedger();
  return useMutation({ mutationFn: (patch: Partial<AccountInput>) => api<Account>(`/api/v1/accounts/${id}`, { method: 'PATCH', body: patch }), onSuccess: invalidate });
}

export function useSetArchived(id: string) {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: (archived: boolean) => api<Account>(`/api/v1/accounts/${id}/${archived ? 'archive' : 'unarchive'}`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useDeleteAccount(id: string) {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: (withTransactions: boolean) => api<void>(`/api/v1/accounts/${id}`, { method: 'DELETE', query: { withTransactions } }),
    onSuccess: invalidate,
  });
}

export function useAdjustBalance(id: string) {
  const invalidate = useInvalidateLedger();
  return useMutation({
    mutationFn: (body: { actualBalance: string; date: string }) =>
      api<{ account: Account; adjustment: Transaction | null }>(`/api/v1/accounts/${id}/balance-adjustments`, { method: 'POST', body }),
    onSuccess: invalidate,
  });
}
