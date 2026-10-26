import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useAccounts, type Account } from '@/features/accounts/api';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney, fromKopecks, toKopecks } from '@workspace/shared/money';
import { cn } from '@/lib/utils';
import { CategoryIcon } from './CategoryIcon';
import { useCategories, useTransactionFeed, type FlatCategory, type Transaction, type TransactionFilters } from './api';

interface RowProps {
  tx: Transaction;
  category?: FlatCategory;
  accounts: Map<string, Account>;
  showAccount: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

function TransactionRow({ tx, category, accounts, showAccount, selectMode, selected, onToggle, onOpen }: RowProps) {
  const negative = tx.amount.startsWith('-');
  const account = accounts.get(tx.accountId);
  const counterpart = tx.transferCounterpartAccountId ? accounts.get(tx.transferCounterpartAccountId) : undefined;

  const title = tx.type === 'adjustment' ? 'Корректировка остатка' : tx.merchant || tx.description || 'Операция';
  const detail = tx.type === 'transfer'
    ? `${negative ? 'На' : 'С'} ${counterpart?.name ?? 'другой счёт'}`
    : tx.type === 'adjustment' ? 'Не входит в статистику' : category?.fullName ?? 'Без категории';
  const meta = [detail, showAccount && account?.name, tx.excludeFromStats && tx.type !== 'adjustment' && 'не в статистике'].filter(Boolean).join(' · ');

  const amountClass = tx.type === 'transfer' || tx.type === 'adjustment' ? 'text-muted-foreground'
    : negative ? 'text-foreground' : 'text-income';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={selectMode ? onToggle : onOpen}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); (selectMode ? onToggle : onOpen)(); } }}
      className={cn('flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2 outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted', selected && 'bg-primary/5')}
      data-testid="transaction-row"
    >
      {selectMode && (
        <Checkbox checked={selected} onCheckedChange={onToggle} onClick={(event) => event.stopPropagation()} aria-label="Выбрать операцию" />
      )}
      <CategoryIcon category={category} type={tx.type} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{meta}</div>
      </div>
      <div className={cn('shrink-0 text-right font-medium tabular-nums', amountClass, tx.excludeFromStats && 'opacity-70')}>
        {tx.type === 'transfer' && <span aria-hidden>{negative ? '→ ' : '← '}</span>}
        {formatMoney(tx.amount, tx.currency, { signed: !negative })}
      </div>
    </div>
  );
}

/** Сумма за день по операциям, которые идут в статистику (расходы и доходы, в рублях). */
function dayTotal(items: Transaction[]): string | null {
  let total = 0n;
  let counted = false;
  for (const tx of items) {
    if ((tx.type !== 'expense' && tx.type !== 'income') || tx.excludeFromStats || tx.amountRub === null) continue;
    total += toKopecks(tx.amountRub);
    counted = true;
  }
  return counted ? fromKopecks(total) : null;
}

interface FeedProps {
  filters: TransactionFilters;
  /** Счёт в строке не нужен, если лента и так по одному счёту. */
  showAccount?: boolean;
  selectMode?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string) => void;
  onOpen: (tx: Transaction) => void;
  empty: ReactNode;
  /** Видимые id — для «Выбрать все». */
  onLoaded?: (ids: string[]) => void;
}

export function TransactionFeed({ filters, showAccount = true, selectMode = false, selected, onToggle, onOpen, empty, onLoaded }: FeedProps) {
  const feed = useTransactionFeed(filters);
  const categories = useCategories();
  const accountsQuery = useAccounts(true);
  const accounts = useMemo(() => new Map(accountsQuery.data?.items.map((item) => [item.id, item])), [accountsQuery.data]);
  const sentinel = useRef<HTMLDivElement>(null);

  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);
  useEffect(() => { onLoaded?.(items.map((tx) => tx.id)); }, [items, onLoaded]);

  // Бесконечная прокрутка: подгружаем следующую страницу, когда низ ленты почти виден
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !feed.hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !feed.isFetchingNextPage) void feed.fetchNextPage();
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage]);

  if (feed.isPending) {
    return (
      <div className="divide-y rounded-xl border bg-card" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-28" /></div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }
  if (feed.isError) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center" data-testid="feed-error">
        <p className="font-medium">Не удалось загрузить операции</p>
        <p className="mt-1 text-sm text-muted-foreground">{errorMessage(feed.error)}</p>
        <Button className="mt-4" variant="outline" onClick={() => feed.refetch()}>Повторить</Button>
      </div>
    );
  }
  if (items.length === 0) return <>{empty}</>;

  const days: [string, Transaction[]][] = [];
  for (const tx of items) {
    const last = days[days.length - 1];
    if (last && last[0] === tx.date) last[1].push(tx);
    else days.push([tx.date, [tx]]);
  }

  return (
    <div className="space-y-4" data-testid="transaction-feed">
      {days.map(([date, dayItems]) => {
        const total = dayTotal(dayItems);
        return (
          <section key={date}>
            <div className="mb-1 flex items-baseline justify-between px-1 text-sm">
              <h3 className="font-medium text-muted-foreground">{formatDate(date)}</h3>
              {total && <span className="tabular-nums text-muted-foreground">{formatMoney(total, 'RUB', { signed: !total.startsWith('-') })}</span>}
            </div>
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {dayItems.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  tx={tx}
                  category={tx.categoryId ? categories.data?.byId.get(tx.categoryId) : undefined}
                  accounts={accounts}
                  showAccount={showAccount}
                  selectMode={selectMode}
                  selected={selected?.has(tx.id) ?? false}
                  onToggle={() => onToggle?.(tx.id)}
                  onOpen={() => onOpen(tx)}
                />
              ))}
            </div>
          </section>
        );
      })}
      <div ref={sentinel} />
      {feed.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
            {feed.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
          </Button>
        </div>
      )}
    </div>
  );
}
