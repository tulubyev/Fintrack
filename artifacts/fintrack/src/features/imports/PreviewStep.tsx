import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@workspace/shared/money';
import { useAccounts } from '@/features/accounts/api';
import { CategorySelect } from '@/features/transactions/CategorySelect';
import { useCommitImport, useDecideRows, useImportRows, type ImportBatch, type ImportRow, type RowStatus } from './api';
import { ROW_STATUS_LABELS } from './labels';

const NEW_ACCOUNT = '__new__';
const PAGE = 100;
const FILTERS: Array<RowStatus | 'all'> = ['all', 'new', 'duplicate', 'possible_duplicate', 'skipped', 'error'];

const importable = (row: ImportRow) => row.status !== 'skipped' && row.status !== 'error';

/**
 * Предпросмотр (E1.2-T15, шаги 4–5): в какой счёт сохранить (найденный по цифрам карты или новый «Банк •• 1234»),
 * чипы «новые / уже есть / пропущены», таблица с решением по каждой строке и категорией, кнопка «Импортировать N».
 */
export function PreviewStep({ batch }: { batch: ImportBatch }) {
  const rows = useImportRows(batch.id, true);
  const accounts = useAccounts();
  const decide = useDecideRows(batch.id);
  const commit = useCommitImport(batch.id);
  const suggested = batch.suggestedAccount;
  const [accountChoice, setAccountChoice] = useState<string>(suggested?.accountId ?? (suggested?.create ? NEW_ACCOUNT : ''));
  const [newName, setNewName] = useState(suggested?.create?.name ?? 'Новый счёт');
  const [filter, setFilter] = useState<RowStatus | 'all'>('all');
  const [shown, setShown] = useState(PAGE);

  // счёт из подсказки мог прийти позже списка — выбираем его, пока пользователь не выбрал сам
  useEffect(() => {
    if (!accountChoice && suggested) setAccountChoice(suggested.accountId ?? NEW_ACCOUNT);
  }, [suggested, accountChoice]);

  const items = rows.data ?? [];
  const counts = useMemo(() => {
    const result = new Map<RowStatus, number>();
    for (const row of items) result.set(row.status, (result.get(row.status) ?? 0) + 1);
    return result;
  }, [items]);
  const toImport = items.filter((row) => importable(row) && row.decision === 'import').length;
  const visible = filter === 'all' ? items : items.filter((row) => row.status === filter);
  const activeAccounts = (accounts.data?.items ?? []).filter((account) => !account.archivedAt);
  const currency = batch.accountCurrency ?? suggested?.create?.currency ?? 'RUB';

  const save = () => {
    if (accountChoice === NEW_ACCOUNT) {
      const base = suggested?.create ?? { name: newName, kind: 'debit_card' as const, institutionCode: batch.institutionCode, currency, lastFour: batch.cardLast4[0] ?? null };
      commit.mutate({ createAccount: { ...base, name: newName.trim() || base.name } });
    } else if (accountChoice) {
      commit.mutate({ accountId: accountChoice });
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-4 md:p-6" data-testid="import-account">
        <h2 className="font-semibold">Куда сохранить операции</h2>
        {batch.cardLast4.length > 0 && <p className="mt-1 text-sm text-muted-foreground">В выписке карта •• {batch.cardLast4.join(', ')}</p>}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Select value={accountChoice} onValueChange={setAccountChoice}>
            <SelectTrigger data-testid="import-account-select"><SelectValue placeholder="Выберите счёт" /></SelectTrigger>
            <SelectContent>
              {activeAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}{account.lastFour && !account.name.includes(account.lastFour) ? ` •• ${account.lastFour}` : ''} · {account.currency}
                </SelectItem>
              ))}
              <SelectItem value={NEW_ACCOUNT}>Новый счёт…</SelectItem>
            </SelectContent>
          </Select>
          {accountChoice === NEW_ACCOUNT && (
            <div className="space-y-1">
              <Label htmlFor="import-new-account" className="sr-only">Название нового счёта</Label>
              <Input id="import-new-account" value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={100} data-testid="import-new-account-name" />
              <p className="text-xs text-muted-foreground">Карта, {currency}{suggested?.create?.lastFour ? `, •• ${suggested.create.lastFour}` : ''}</p>
            </div>
          )}
        </div>
      </section>

      {batch.warnings.length > 0 && (
        <div className="space-y-1 rounded-xl border border-warning/30 bg-warning-subtle p-4 text-sm text-warning" data-testid="import-warnings">
          {batch.warnings.map((warning) => <p key={warning} className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{warning}</p>)}
        </div>
      )}
      {batch.duplicateOfImportId && (
        <p className="rounded-xl border bg-card p-4 text-sm" data-testid="import-duplicate-file">Этот файл уже загружали — такие операции будут отмечены как «уже есть».</p>
      )}

      <section className="rounded-xl border bg-card" data-testid="import-preview">
        <div className="flex flex-wrap gap-2 border-b p-4">
          {FILTERS.filter((item) => item === 'all' || counts.get(item)).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { setFilter(item); setShown(PAGE); }}
              className={cn('rounded-full border px-3 py-1 text-sm', filter === item ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted')}
              data-testid={`import-filter-${item}`}
            >
              {item === 'all' ? `Все ${items.length}` : `${counts.get(item)} ${ROW_STATUS_LABELS[item]}`}
            </button>
          ))}
        </div>
        {rows.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : rows.isError ? (
          <p className="p-4 text-sm text-destructive">{errorMessage(rows.error)}</p>
        ) : (
          <ul className="divide-y">
            {visible.slice(0, shown).map((row) => (
              <li key={row.id} className={cn('flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm', row.decision !== 'import' && 'opacity-60')} data-testid="import-row">
                <Checkbox
                  checked={importable(row) && row.decision === 'import'}
                  disabled={!importable(row)}
                  onCheckedChange={(value) => decide.mutate([{ rowId: row.id, decision: value === true ? 'import' : 'skip' }])}
                  aria-label="Импортировать строку"
                />
                <div className="min-w-0 flex-1 basis-40">
                  <div className="truncate">{row.description}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {formatDate(row.date)}
                    {row.status !== 'new' && (
                      <Badge variant={row.status === 'error' ? 'destructive' : 'secondary'} className="font-normal">
                        {row.status === 'duplicate' ? 'уже есть' : row.status === 'skipped' || row.status === 'error' ? (row.errorMessage ?? ROW_STATUS_LABELS[row.status]) : ROW_STATUS_LABELS[row.status]}
                      </Badge>
                    )}
                  </div>
                </div>
                <span className={cn('shrink-0 text-right font-medium tabular-nums sm:order-last sm:w-28', !row.amount.startsWith('-') && 'text-success')}>{formatMoney(row.amount, row.currency, { signed: true })}</span>
                {importable(row) && (
                  <div className="w-full pl-7 sm:w-48 sm:pl-0">
                    <CategorySelect
                      value={row.categoryId}
                      onChange={(categoryId) => decide.mutate([{ rowId: row.id, categoryId }])}
                      kind={row.amount.startsWith('-') ? 'expense' : 'income'}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {visible.length > shown && (
          <div className="border-t p-3 text-center"><Button variant="ghost" onClick={() => setShown((value) => value + PAGE)}>Показать ещё {Math.min(PAGE, visible.length - shown)}</Button></div>
        )}
      </section>

      {batch.errorMessage && <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive" data-testid="import-commit-error">{batch.errorMessage}</p>}
      {commit.isError && <p className="text-sm text-destructive" data-testid="import-commit-error">{errorMessage(commit.error)}</p>}
      <div className="sticky bottom-20 flex items-center justify-between gap-3 rounded-xl border bg-card/95 p-3 shadow-sm backdrop-blur md:bottom-4">
        <span className="text-sm text-muted-foreground">Отмечено {toImport} из {items.length}</span>
        <Button disabled={!toImport || !accountChoice || commit.isPending} onClick={save} data-testid="import-commit">
          {toImport ? `Импортировать ${toImport} ${plural(toImport, 'операцию', 'операции', 'операций')}` : 'Нечего импортировать'}
        </Button>
      </div>
    </div>
  );
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
