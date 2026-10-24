import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toApiError } from '@workspace/shared/api';
import { api } from '@/lib/api';

/** Импорт выписок (E1.2-T15): /api/v1/imports. Разбор и коммит идут в воркере — статус опрашиваем раз в секунду. */

export type ImportStatus = 'uploaded' | 'parsing' | 'needs_mapping' | 'preview' | 'committing' | 'done' | 'failed' | 'cancelled' | 'undone';
export type RowStatus = 'new' | 'duplicate' | 'possible_duplicate' | 'skipped' | 'error';
export type Decision = 'import' | 'skip' | 'merge';

export interface ColumnMapping {
  date: string;
  description: string;
  amount?: string;
  income?: string;
  expense?: string;
  currency?: string;
  mcc?: string;
  category?: string;
  dateFormat?: 'DD.MM.YYYY' | 'DD.MM.YY' | 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';
  signConvention: 'signed' | 'split' | 'expense_positive';
}

export interface SuggestedAccount {
  accountId?: string;
  create?: { name: string; kind: 'debit_card'; institutionCode: string | null; currency: string; lastFour: string | null };
  warning?: string;
}

export interface ImportBatch {
  id: string;
  status: ImportStatus;
  fileName: string;
  fileType: 'csv' | 'xlsx' | 'pdf';
  parserCode: string | null;
  institutionCode: string | null;
  accountId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  stats: { total?: number; new?: number; duplicate?: number; possibleDuplicate?: number; skipped?: number; error?: number; imported?: number; undone?: number };
  warnings: string[];
  cardLast4: string[];
  accountCurrency: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  duplicateOfImportId: string | null;
  mappingPreview?: { header: string[]; headerRowIndex: number; rows: string[][]; fingerprint: string } | null;
  suggestedMapping?: ColumnMapping | null;
  columnMapping: ColumnMapping | null;
  suggestedAccount: SuggestedAccount | null;
  balanceCheck: { statementClosing: string; computedClosing: string; diff: string } | null;
  editedCount?: number;
  createdAt: string;
  committedAt: string | null;
}

export interface ImportRow {
  id: string;
  rowIndex: number;
  status: RowStatus;
  decision: Decision;
  decidedByUser: boolean;
  errorMessage: string | null;
  matchTransactionId: string | null;
  categoryId: string | null;
  transactionId: string | null;
  date: string;
  time: string | null;
  amount: string;
  currency: string;
  description: string;
  merchant: string | null;
  mcc: string | null;
}

/** Разбор или коммит ещё идёт — продолжаем опрос. */
export const BUSY: ImportStatus[] = ['uploaded', 'parsing', 'committing'];

const keys = {
  list: ['v1', 'imports'] as const,
  batch: (id: string) => ['v1', 'imports', id] as const,
  rows: (id: string) => ['v1', 'imports', id, 'rows'] as const,
};

export const useImport = (id: string) =>
  useQuery({
    queryKey: keys.batch(id),
    queryFn: () => api<ImportBatch>(`/api/v1/imports/${id}`),
    refetchInterval: (query) => (query.state.data && BUSY.includes(query.state.data.status) ? 1000 : false),
  });

export const useRecentImports = () =>
  useQuery({ queryKey: keys.list, queryFn: () => api<{ items: ImportBatch[] }>('/api/v1/imports', { query: { limit: 5 } }), staleTime: 10_000 });

/** Все строки предпросмотра: страницы по 500, пока не кончатся (выписка — до нескольких тысяч операций). */
export const useImportRows = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: keys.rows(id),
    enabled,
    queryFn: async () => {
      const items: ImportRow[] = [];
      let cursor: string | null = null;
      do {
        const page: { items: ImportRow[]; nextCursor: string | null } = await api(`/api/v1/imports/${id}/rows`, { query: { limit: 500, ...(cursor ? { cursor } : {}) } });
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      return items;
    },
  });

/** Загрузка файла: multipart, поэтому мимо api() — тот же токен, тот же формат ошибок. */
export async function uploadStatement(file: File, fields: { accountId?: string; institutionCode?: string }): Promise<ImportBatch> {
  const form = new FormData();
  form.append('file', file, file.name);
  if (fields.accountId) form.append('accountId', fields.accountId);
  if (fields.institutionCode) form.append('institutionCode', fields.institutionCode);
  const headers: Record<string, string> = {};
  const token = localStorage.getItem('accessToken');
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch('/api/v1/imports', { method: 'POST', headers, body: form });
  if (!response.ok) throw await toApiError(response);
  return response.json();
}

export function useSetMapping(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { mapping: ColumnMapping; remember: boolean }) => api<ImportBatch>(`/api/v1/imports/${id}/mapping`, { method: 'PUT', body }),
    onSuccess: (batch) => queryClient.setQueryData(keys.batch(id), batch),
  });
}

/** Решение по строке сразу видно в таблице; при ошибке строки перечитываются. */
export function useDecideRows(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (decisions: Array<{ rowId: string; decision?: Decision; categoryId?: string | null }>) =>
      api<{ updated: number }>(`/api/v1/imports/${id}/rows`, { method: 'PATCH', body: { decisions } }),
    onMutate: (decisions) => {
      queryClient.setQueryData<ImportRow[]>(keys.rows(id), (rows) => rows?.map((row) => {
        const change = decisions.find((item) => item.rowId === row.id);
        if (!change) return row;
        return { ...row, ...(change.decision ? { decision: change.decision, decidedByUser: true } : {}), ...(change.categoryId !== undefined ? { categoryId: change.categoryId } : {}) };
      }));
    },
    onError: () => queryClient.invalidateQueries({ queryKey: keys.rows(id) }),
  });
}

/** После коммита и отмены меняются счета, операции, бюджеты и главная. */
function useInvalidateAfterImport(id: string) {
  const queryClient = useQueryClient();
  return () => Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.batch(id) }),
    queryClient.invalidateQueries({ queryKey: keys.list }),
    queryClient.invalidateQueries({ queryKey: ['v1', 'accounts'] }),
    queryClient.invalidateQueries({ queryKey: ['v1', 'transactions'] }),
    queryClient.invalidateQueries({ queryKey: ['v1', 'budgets'] }),
    queryClient.invalidateQueries({ queryKey: ['v1', 'dashboard'] }),
  ]);
}

export function useCommitImport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { accountId: string } | { createAccount: NonNullable<SuggestedAccount['create']> }) =>
      api<ImportBatch>(`/api/v1/imports/${id}/commit`, { method: 'POST', body }),
    onSuccess: (batch) => queryClient.setQueryData(keys.batch(id), batch),
  });
}

export function useUndoImport(id: string) {
  const invalidate = useInvalidateAfterImport(id);
  return useMutation({ mutationFn: () => api<ImportBatch>(`/api/v1/imports/${id}/undo`, { method: 'POST' }), onSuccess: invalidate });
}

export function useCancelImport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>(`/api/v1/imports/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.list }),
  });
}

export { useInvalidateAfterImport };
