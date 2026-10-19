import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { CheckSquare, ChevronDown, Search, Upload, X } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAccounts } from '@/features/accounts/api';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { formatMoney, todayIso } from '@/lib/money';
import { cn } from '@/lib/utils';
import { CategorySelect } from './CategorySelect';
import { TransactionFeed } from './TransactionFeed';
import { TransactionSheet } from './TransactionSheet';
import {
  useBulkUpdate, useCategories, useTransactionSummary, type BulkAction, type Transaction, type TransactionFilters, type TransactionType,
} from './api';

type Period = 'month' | 'prev' | '3m' | 'all' | 'custom';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'month', label: 'Этот месяц' },
  { value: 'prev', label: 'Прошлый месяц' },
  { value: '3m', label: '3 месяца' },
  { value: 'all', label: 'Всё время' },
  { value: 'custom', label: 'Свой период' },
];

const TYPES: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
  { value: 'transfer', label: 'Переводы' },
  { value: 'adjustment', label: 'Корректировки' },
];

const UNCATEGORIZED = 'none';

/** Границы периода по московскому календарю. */
function periodRange(period: Period, from?: string, to?: string): { from?: string; to?: string } {
  const [y, m] = todayIso().split('-').map(Number);
  const iso = (year: number, month: number, day: number) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.toISOString().slice(0, 10);
  };
  switch (period) {
    case 'month': return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case 'prev': return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case '3m': return { from: iso(y, m - 2, 1), to: iso(y, m + 1, 0) };
    case 'custom': return { from: from || undefined, to: to || undefined };
    default: return {};
  }
}

/** Фильтры живут в адресе: экран открывается по закладке и «Назад» возвращает прежний вид. */
function useFilterParams() {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const set = useCallback((changes: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) value.forEach((item) => next.append(key, item));
      else if (value) next.set(key, value);
    }
    const query = next.toString();
    navigate(query ? `${location}?${query}` : location, { replace: true });
  }, [search, location, navigate]);

  return { params, set };
}

function MultiFilter({ label, options, selected, onChange, testId }: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  testId: string;
}) {
  const toggle = (value: string, checked: boolean) => onChange(checked ? [...selected, value] : selected.filter((item) => item !== value));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={selected.length ? 'secondary' : 'outline'} size="sm" className="gap-1" data-testid={testId}>
          {label}{selected.length > 0 && ` · ${selected.length}`}<ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onCheckedChange={(checked) => toggle(option.value, checked === true)}
            onSelect={(event) => event.preventDefault()}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BulkBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const { toast } = useToast();
  const bulk = useBulkUpdate();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function run(action: BulkAction, categoryId?: string) {
    try {
      const { updated } = await bulk.mutateAsync({ ids, action, categoryId });
      const done = { set_category: 'Категория изменена', delete: 'Удалено', exclude: 'Исключено из статистики', include: 'Возвращено в статистику' }[action];
      toast({ title: done, description: `Операций: ${updated}` });
      onDone();
    } catch (error) {
      toast({ title: 'Не получилось', description: errorMessage(error), variant: 'destructive' });
    }
  }

  return (
    <div className="sticky bottom-20 z-10 mt-4 flex flex-wrap items-center gap-2 rounded-xl border bg-background p-3 shadow-lg md:bottom-4" data-testid="bulk-bar">
      <span className="mr-auto text-sm font-medium">Выбрано: {ids.length}</span>
      <div className="w-52">
        <CategorySelect value={undefined} allowNone={false} onChange={(categoryId) => categoryId && void run('set_category', categoryId)} placeholder="Категория…" testId="bulk-category" />
      </div>
      <Button variant="outline" size="sm" disabled={!ids.length || bulk.isPending} onClick={() => void run('exclude')}>Не учитывать</Button>
      <Button variant="outline" size="sm" disabled={!ids.length || bulk.isPending} onClick={() => void run('include')}>Учитывать</Button>
      <Button variant="destructive" size="sm" disabled={!ids.length || bulk.isPending} onClick={() => setConfirmDelete(true)} data-testid="bulk-delete">Удалить</Button>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить операций: {ids.length}?</AlertDialogTitle>
            <AlertDialogDescription>Остатки счетов пересчитаются. У переводов удалятся обе части.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void run('delete')}>Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function TransactionsPage() {
  const { params, set } = useFilterParams();
  const accounts = useAccounts(true);
  const categories = useCategories();

  const period = (params.get('period') as Period) || 'month';
  const accountIds = params.getAll('account');
  const categoryIds = params.getAll('category');
  const types = params.getAll('type') as TransactionType[];
  const q = params.get('q') ?? '';

  // Поиск — с паузой, чтобы не дёргать API на каждую букву
  const [searchText, setSearchText] = useState(q);
  useEffect(() => setSearchText(q), [q]);
  useEffect(() => {
    if (searchText.trim() === q) return;
    const timer = setTimeout(() => set({ q: searchText.trim() || null }), 300);
    return () => clearTimeout(timer);
  }, [searchText, q, set]);

  const filters: TransactionFilters = useMemo(() => {
    const range = periodRange(period, params.get('from') ?? undefined, params.get('to') ?? undefined);
    return {
      ...range,
      accountId: accountIds.length ? accountIds : undefined,
      categoryId: categoryIds.filter((id) => id !== UNCATEGORIZED).length ? categoryIds.filter((id) => id !== UNCATEGORIZED) : undefined,
      uncategorized: categoryIds.includes(UNCATEGORIZED) || undefined,
      type: types.length ? types : undefined,
      q: q || undefined,
    };
  }, [period, params, accountIds.join(), categoryIds.join(), types.join(), q]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilters = Boolean(accountIds.length || categoryIds.length || types.length || q || period === 'custom');
  const resetFilters = () => set({ account: null, category: null, type: null, q: null, from: null, to: null, period: null });
  const summary = useTransactionSummary(filters);

  const [opened, setOpened] = useState<Transaction | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const stopSelecting = () => { setSelectMode(false); setSelected(new Set()); };
  useEffect(() => { setSelected(new Set()); }, [filters]);

  const accountOptions = (accounts.data?.items ?? []).map((account) => ({ value: account.id, label: account.name }));
  const categoryOptions = [
    { value: UNCATEGORIZED, label: 'Без категории' },
    ...(categories.data?.tree ?? []).filter((node) => node.kind !== 'transfer' && !node.hidden).map((node) => ({ value: node.id, label: node.name })),
  ];

  const empty = hasFilters || period !== 'all' ? (
    <div className="rounded-xl border bg-card p-8 text-center" data-testid="feed-empty-filtered">
      <p className="font-medium">Ничего не найдено</p>
      <p className="mt-1 text-sm text-muted-foreground">Попробуйте другой период или уберите фильтры.</p>
      <div className="mt-4 flex justify-center gap-2">
        {hasFilters && <Button variant="outline" onClick={resetFilters}>Сбросить фильтры</Button>}
        {period !== 'all' && <Button variant="outline" onClick={() => set({ period: 'all', from: null, to: null })}>За всё время</Button>}
      </div>
    </div>
  ) : (
    <div className="rounded-xl border bg-card p-8 text-center" data-testid="feed-empty">
      <p className="font-medium">Операций пока нет</p>
      <p className="mt-1 text-sm text-muted-foreground">Загрузите выписку банка — операции появятся здесь с категориями.</p>
      <div className="mt-4 flex justify-center gap-2">
        <Button asChild><Link href="/import"><Upload className="mr-2 size-4" />Загрузить выписку</Link></Button>
        <Button variant="outline" asChild><Link href="/accounts">Мои счета</Link></Button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Операции"
        actions={selectMode
          ? <Button variant="outline" onClick={stopSelecting}><X className="mr-2 size-4" />Готово</Button>
          : <Button variant="outline" onClick={() => setSelectMode(true)} data-testid="select-mode"><CheckSquare className="mr-2 size-4" />Выбрать</Button>}
      />

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Поиск по описанию, магазину, заметке"
            className="pl-9"
            aria-label="Поиск операций"
            data-testid="feed-search"
          />
        </div>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" role="group" aria-label="Период">
          {PERIODS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => set({ period: item.value === 'month' ? null : item.value, ...(item.value !== 'custom' ? { from: null, to: null } : {}) })}
              aria-pressed={period === item.value}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-sm transition-colors',
                period === item.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input type="date" className="w-auto" value={params.get('from') ?? ''} max={todayIso()} onChange={(e) => set({ from: e.target.value || null })} aria-label="С даты" />
            <span>—</span>
            <Input type="date" className="w-auto" value={params.get('to') ?? ''} onChange={(e) => set({ to: e.target.value || null })} aria-label="По дату" />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <MultiFilter label="Счета" options={accountOptions} selected={accountIds} onChange={(values) => set({ account: values })} testId="filter-accounts" />
          <MultiFilter label="Категории" options={categoryOptions} selected={categoryIds} onChange={(values) => set({ category: values })} testId="filter-categories" />
          <MultiFilter label="Тип" options={TYPES} selected={types} onChange={(values) => set({ type: values })} testId="filter-types" />
          {hasFilters && <Button variant="ghost" size="sm" onClick={resetFilters}>Сбросить</Button>}
        </div>

        {summary.data && summary.data.count > 0 && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm" data-testid="feed-summary">
            <span>Расходы <b className="tabular-nums">{formatMoney(summary.data.expense, 'RUB')}</b></span>
            <span>Доходы <b className="tabular-nums text-[hsl(142,71%,32%)]">{formatMoney(summary.data.income, 'RUB')}</b></span>
            <span className="text-muted-foreground">Итог <span className="tabular-nums">{formatMoney(summary.data.net, 'RUB', { signed: true })}</span></span>
          </div>
        )}
      </div>

      {selectMode && (
        <div className="mb-2 flex gap-2 text-sm">
          <Button variant="link" size="sm" className="px-0" onClick={() => setSelected(new Set(visibleIds))}>Выбрать все на экране</Button>
          {selected.size > 0 && <Button variant="link" size="sm" className="px-0" onClick={() => setSelected(new Set())}>Снять выбор</Button>}
        </div>
      )}

      <TransactionFeed
        filters={filters}
        selectMode={selectMode}
        selected={selected}
        onToggle={toggle}
        onOpen={setOpened}
        onLoaded={setVisibleIds}
        empty={empty}
      />

      {selectMode && selected.size > 0 && <BulkBar ids={[...selected]} onDone={stopSelecting} />}
      <TransactionSheet tx={opened} onClose={() => setOpened(null)} />
    </>
  );
}
