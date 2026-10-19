/**
 * Быстрое добавление операции (E1.1-T8): «+» в нижней панели, кнопка в боковой панели и в ленте, клавиша N.
 * Расход / доход / перевод; после сохранения — тост «Сохранено» с «Отменить» (5 с).
 */
import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToastAction } from '@/components/ui/toast';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import { useAccounts, type Account } from '@/features/accounts/api';
import { toast as showToast, useToast } from '@/hooks/use-toast';
import { api, errorMessage } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { currencySymbol, parseMoneyInput, todayIso } from '@/lib/money';
import { cn } from '@/lib/utils';
import { CategoryIcon } from './CategoryIcon';
import { CategorySelect } from './CategorySelect';
import { useCreateTransaction, useCreateTransfer, useFrequentCategories } from './api';

type Kind = 'expense' | 'income' | 'transfer';

interface QuickAddContextValue {
  open: (kind?: Kind) => void;
}

const QuickAddContext = createContext<QuickAddContextValue>({ open: () => {} });
export const useQuickAdd = () => useContext(QuickAddContext);

const LAST_ACCOUNT_KEY = 'ft_last_account';
const readLastAccount = () => { try { return localStorage.getItem(LAST_ACCOUNT_KEY); } catch { return null; } };
const saveLastAccount = (id: string) => { try { localStorage.setItem(LAST_ACCOUNT_KEY, id); } catch { /* приватный режим */ } };
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined);

/** Отмена из тоста: форма к этому моменту уже закрыта, поэтому без хуков — запрос и обновление кеша напрямую. */
async function undo(path: string, done: string) {
  try {
    await api<void>(path, { method: 'DELETE' });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['v1', 'transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['v1', 'accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['v1', 'budgets'] }),
    ]);
    showToast({ title: done });
  } catch (error) {
    showToast({ title: 'Не удалось отменить', description: errorMessage(error), variant: 'destructive' });
  }
}

function shiftDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function AccountSelect({ accounts, value, onChange, testId, exclude }: { accounts: Account[]; value: string; onChange: (id: string) => void; testId: string; exclude?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}><SelectValue placeholder="Выберите счёт" /></SelectTrigger>
      <SelectContent>
        {accounts.filter((account) => account.id !== exclude).map((account) => (
          <SelectItem key={account.id} value={account.id}>{account.name}{account.currency !== 'RUB' ? ` · ${account.currency}` : ''}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function QuickAddForm({ initialKind, onDone }: { initialKind: Kind; onDone: () => void }) {
  const { toast } = useToast();
  const accountsQuery = useAccounts();
  const accounts = (accountsQuery.data?.items ?? []).filter((account) => !account.archivedAt);
  const createTx = useCreateTransaction();
  const createTransfer = useCreateTransfer();

  const [kind, setKind] = useState<Kind>(initialKind);
  const [requestId] = useState(newId);
  const [amount, setAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frequent = useFrequentCategories(kind === 'income' ? 'income' : 'expense');

  // Счёт по умолчанию — последний использованный
  useEffect(() => {
    if (accountId || accounts.length === 0) return;
    const last = readLastAccount();
    setAccountId(accounts.some((account) => account.id === last) ? last! : accounts[0].id);
  }, [accounts, accountId]);
  useEffect(() => { setCategoryId(null); setShowAllCategories(false); }, [kind]);

  const from = accounts.find((account) => account.id === accountId);
  const to = accounts.find((account) => account.id === toAccountId);
  const crossCurrency = kind === 'transfer' && from && to && from.currency !== to.currency;
  const saving = createTx.isPending || createTransfer.isPending;

  if (accountsQuery.isPending) return <p className="py-6 text-center text-sm text-muted-foreground">Загрузка…</p>;
  if (accounts.length === 0) {
    return (
      <div className="py-4 text-center" data-testid="quick-add-no-accounts">
        <p className="font-medium">Сначала добавьте счёт</p>
        <p className="mt-1 text-sm text-muted-foreground">Операция всегда принадлежит счёту: карте, наличным или вкладу.</p>
        <Button className="mt-4" asChild onClick={onDone}><Link href="/accounts">К счетам</Link></Button>
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const value = parseMoneyInput(amount, { allowNegative: false });
    if (!value || value === '0.00') { setError('Введите сумму, например 1 234,56'); return; }
    if (!accountId) { setError('Выберите счёт'); return; }
    if (date > todayIso()) { setError('Дата не может быть в будущем'); return; }

    try {
      if (kind === 'transfer') {
        if (!toAccountId) { setError('Выберите, куда перевести'); return; }
        const second = crossCurrency ? parseMoneyInput(toAmount, { allowNegative: false }) : undefined;
        if (crossCurrency && (!second || second === '0.00')) { setError(`Сколько зачислено в ${to!.currency}?`); return; }
        const transfer = await createTransfer.mutateAsync({
          id: requestId, fromAccountId: accountId, toAccountId, amount: value, toAmount: second ?? undefined, date, note: note.trim() || null,
        });
        saveLastAccount(accountId);
        onDone();
        toast({
          title: 'Перевод сохранён',
          duration: 5000,
          action: <ToastAction altText="Отменить перевод" onClick={() => void undo(`/api/v1/transfers/${transfer.transferGroupId}`, 'Перевод отменён')}>Отменить</ToastAction>,
        });
      } else {
        const tx = await createTx.mutateAsync({
          id: requestId, accountId, type: kind, amount: value, date, categoryId, merchant: merchant.trim() || null, note: note.trim() || null,
        });
        saveLastAccount(accountId);
        onDone();
        toast({
          title: 'Сохранено',
          duration: 5000,
          action: <ToastAction altText="Отменить операцию" onClick={() => void undo(`/api/v1/transactions/${tx.id}`, 'Операция отменена')}>Отменить</ToastAction>,
        });
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const tabs: { value: Kind; label: string }[] = [
    { value: 'expense', label: 'Расход' },
    { value: 'income', label: 'Доход' },
    ...(accounts.length > 1 ? [{ value: 'transfer' as const, label: 'Перевод' }] : []),
  ];

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate data-testid="quick-add-form">
      <div className="grid grid-flow-col gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Вид операции">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={kind === tab.value}
            onClick={() => setKind(tab.value)}
            className={cn('rounded-md py-1.5 text-sm font-medium transition-colors', kind === tab.value ? 'bg-background shadow-sm' : 'text-muted-foreground')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Input
          inputMode="decimal"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          aria-label="Сумма"
          className="h-16 pr-12 text-3xl font-semibold tabular-nums"
          data-testid="quick-amount"
        />
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground">{currencySymbol(from?.currency ?? 'RUB')}</span>
      </div>

      {kind !== 'transfer' ? (
        <>
          <div className="grid gap-2">
            <Label>Категория</Label>
            {showAllCategories ? (
              <CategorySelect value={categoryId} onChange={setCategoryId} kind={kind} testId="quick-category-all" />
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {frequent.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setCategoryId(categoryId === category.id ? null : category.id)}
                    aria-pressed={categoryId === category.id}
                    className={cn('flex flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs transition-colors', categoryId === category.id ? 'border-primary bg-primary/5' : 'hover:bg-muted')}
                    data-testid="quick-category"
                  >
                    <CategoryIcon category={category} type={kind} className="size-8" />
                    <span className="line-clamp-2 leading-tight">{category.name}</span>
                  </button>
                ))}
                <button type="button" onClick={() => setShowAllCategories(true)} className="flex items-center justify-center rounded-lg border border-dashed p-2 text-xs text-muted-foreground hover:bg-muted">
                  Все
                </button>
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Счёт</Label>
              <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} testId="quick-account" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quick-merchant">{kind === 'expense' ? 'Где' : 'От кого'}</Label>
              <Input id="quick-merchant" value={merchant} maxLength={200} onChange={(e) => setMerchant(e.target.value)} placeholder="Необязательно" />
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Откуда</Label>
            <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} testId="quick-from" />
          </div>
          <div className="grid gap-2">
            <Label>Куда</Label>
            <AccountSelect accounts={accounts} value={toAccountId} onChange={setToAccountId} testId="quick-to" exclude={accountId} />
          </div>
          {crossCurrency && (
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="quick-to-amount">Зачислено, {to!.currency}</Label>
              <Input id="quick-to-amount" inputMode="decimal" value={toAmount} onChange={(e) => setToAmount(e.target.value)} placeholder="0" />
            </div>
          )}
        </div>
      )}

      <div className="grid gap-2">
        <Label>Дата</Label>
        <div className="flex flex-wrap items-center gap-2">
          {[{ label: 'Сегодня', value: todayIso() }, { label: 'Вчера', value: shiftDays(todayIso(), -1) }].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setDate(option.value)}
              aria-pressed={date === option.value}
              className={cn('rounded-full border px-3 py-1 text-sm', date === option.value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              {option.label}
            </button>
          ))}
          <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className="w-auto" aria-label="Другая дата" />
        </div>
      </div>

      {showNote ? (
        <div className="grid gap-2">
          <Label htmlFor="quick-note">Заметка</Label>
          <Input id="quick-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} autoFocus />
        </div>
      ) : (
        <button type="button" onClick={() => setShowNote(true)} className="justify-self-start text-sm text-primary hover:underline">+ Заметка</button>
      )}

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" size="lg" disabled={saving} data-testid="quick-save">{saving ? 'Сохраняем…' : 'Сохранить'}</Button>
    </form>
  );
}

export function QuickAddProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; kind: Kind; key: number }>({ open: false, kind: 'expense', key: 0 });
  const open = useCallback((kind: Kind = 'expense') => setState((current) => ({ open: true, kind, key: current.key + 1 })), []);
  const close = () => setState((current) => ({ ...current, open: false }));

  // Клавиша N на десктопе — если фокус не в поле ввода и не открыт другой диалог
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n' && event.key.toLowerCase() !== 'т') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable=true], [role=dialog]')) return;
      event.preventDefault();
      open();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Ссылка /transactions?new=1 (старые закладки, письма) тоже открывает форму
  const search = useSearch();
  const [location, navigate] = useLocation();
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get('new') !== '1') return;
    params.delete('new');
    navigate(params.toString() ? `${location}?${params}` : location, { replace: true });
    open();
  }, [search, location, navigate, open]);

  return (
    <QuickAddContext.Provider value={{ open }}>
      {children}
      <ResponsiveDialog open={state.open} onOpenChange={(next) => !next && close()} title="Новая операция">
        <QuickAddForm key={state.key} initialKind={state.kind} onDone={close} />
      </ResponsiveDialog>
    </QuickAddContext.Provider>
  );
}
