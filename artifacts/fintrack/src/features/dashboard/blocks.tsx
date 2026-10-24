/**
 * Блоки главного экрана (E1.5-T3): итоги, график трат с топом категорий, ближайшие списания, бюджеты, цели,
 * последние операции. Каждый блок сам показывает загрузку и ошибку, клики уходят в событие dashboard_block_clicked.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BudgetIcon, BudgetProgress, budgetName } from '@/features/budgets/BudgetCard';
import { GoalIcon } from '@/features/goals/GoalVisuals';
import { CategoryIcon } from '@/features/transactions/CategoryIcon';
import { useCategories, useTransactionFeed } from '@/features/transactions/api';
import { daysUntil, whenText } from '@/features/recurring/api';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney, todayIso, toKopecks } from '@workspace/shared/money';
import { cn } from '@/lib/utils';
import { addDays, daysInMonth, shiftMonth, useSpending, type DashboardSummary } from './api';

type Block = 'balance' | 'month_expense' | 'top_category' | 'upcoming' | 'budget' | 'goal' | 'recent_tx' | 'uncategorized' | 'stale_banner';
export const clicked = (block: Block) => () => track('dashboard_block_clicked', { block });

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const shortDay = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]}`;

export function Card({ title, action, children, className, testId }: { title?: string; action?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 md:p-5', className)} data-testid={testId}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function BlockError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="py-4 text-center text-sm">
      <p className="text-muted-foreground">Не удалось загрузить: {errorMessage(error)}</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>Повторить</Button>
    </div>
  );
}

const AllLink = ({ href, children, block }: { href: string; children: ReactNode; block: Block }) => (
  <Link href={href} onClick={clicked(block)} className="flex shrink-0 items-center whitespace-nowrap text-sm font-medium text-primary hover:underline">
    {children}<ChevronRight className="size-4" aria-hidden />
  </Link>
);

/** «▲ 10,7%» — рост трат красным, снижение зелёным. */
function Delta({ pct, inverse = false }: { pct: number | null; inverse?: boolean }) {
  if (pct === null) return null;
  const up = pct > 0;
  const good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center text-xs font-medium tabular-nums', pct === 0 ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive')}>
      <Icon className="size-3.5" aria-hidden />{Math.abs(pct).toLocaleString('ru-RU')}%
    </span>
  );
}

// ---------- итоги ----------

export function StatCards({ data }: { data: DashboardSummary }) {
  const { balance, period } = data;
  const prevMonth = shiftMonth(data.month, -1);
  const prevTo = Math.min(period.daysPassed, daysInMonth(prevMonth));
  const comparedTo = `1–${prevTo} ${MONTHS_GEN[Number(prevMonth.slice(5, 7)) - 1]}`;
  const foreign = balance.byCurrency.some((item) => item.currency !== 'RUB');
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="stat-cards">
      <Link href="/accounts" onClick={clicked('balance')} className="col-span-2 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 lg:col-span-1" data-testid="stat-balance">
        <p className="text-sm text-muted-foreground">Баланс</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums md:text-xl">{formatMoney(balance.totalRub)}</p>
        <p className="text-xs text-muted-foreground">
          {balance.accountsCount} {balance.accountsCount === 1 ? 'счёт' : balance.accountsCount < 5 && balance.accountsCount > 0 ? 'счёта' : 'счетов'}
          {foreign && ' · валюта по курсу ЦБ'}
        </p>
      </Link>
      <Link
        href={`/transactions?type=expense`}
        onClick={clicked('month_expense')}
        className="col-span-2 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 sm:col-span-1"
        data-testid="stat-expense"
      >
        <p className="text-sm text-muted-foreground">Траты месяца</p>
        <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(period.expense)}</p>
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {period.expenseDeltaPct === null
            ? `за 1–${prevTo} ${MONTHS_GEN[Number(prevMonth.slice(5, 7)) - 1]} трат не было`
            : <><Delta pct={period.expenseDeltaPct} inverse /> к {comparedTo}</>}
        </p>
      </Link>
      <div className="rounded-xl border bg-card p-4" data-testid="stat-income">
        <p className="text-sm text-muted-foreground">Доходы месяца</p>
        <p className="mt-1 text-xl font-semibold tabular-nums text-success">{formatMoney(period.income)}</p>
      </div>
      <div className="rounded-xl border bg-card p-4" data-testid="stat-net">
        <p className="text-sm text-muted-foreground">Остаток месяца</p>
        <p className={cn('mt-1 text-xl font-semibold tabular-nums', toKopecks(period.net) < 0n && 'text-destructive')}>{formatMoney(period.net, 'RUB', { signed: true })}</p>
        <p className="text-xs text-muted-foreground">доходы − траты</p>
      </div>
    </div>
  );
}

// ---------- график и категории ----------

type Range = 'month' | '3m';

function useChartData(range: Range, month: string, today: string) {
  const prev = shiftMonth(month, -1);
  const current = useSpending(range === 'month'
    ? { from: `${month}-01`, to: today, groupBy: 'day' }
    : { from: `${shiftMonth(month, -2)}-01`, to: today, groupBy: 'week' });
  const previous = useSpending({ from: `${prev}-01`, to: `${prev}-${String(daysInMonth(prev)).padStart(2, '0')}`, groupBy: 'day' });
  if (range === '3m') {
    return { query: current, rows: (current.data?.items ?? []).map((item) => ({ label: shortDay(item.key!), amount: Number(item.amount), raw: item.amount, prev: null })) };
  }
  const byDay = new Map((current.data?.items ?? []).map((item) => [Number(item.key!.slice(8, 10)), item.amount]));
  const prevByDay = new Map((previous.data?.items ?? []).map((item) => [Number(item.key!.slice(8, 10)), item.amount]));
  const rows = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const d = i + 1;
    const raw = byDay.get(d) ?? (`${month}-${String(d).padStart(2, '0')}` <= today ? '0' : null);
    return { label: String(d), amount: raw === null ? null : Number(raw), raw, prev: d <= daysInMonth(prev) ? Number(prevByDay.get(d) ?? 0) : null };
  });
  return { query: current.isError ? current : previous, rows };
}

export function SpendingBlock({ data }: { data: DashboardSummary }) {
  const [range, setRange] = useState<Range>('month');
  const today = todayIso();
  const { query, rows } = useChartData(range, data.month, today);
  const top = data.topCategories;

  return (
    <Card
      title="Траты"
      testId="spending-block"
      action={(
        <div className="flex rounded-md border p-0.5 text-sm" role="group" aria-label="Период графика">
          {([['month', 'Месяц'], ['3m', '3 месяца']] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
              className={cn('rounded px-2.5 py-1', range === value ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    >
      {query.isError ? <BlockError error={query.error} onRetry={() => query.refetch()} /> : query.isPending ? <Skeleton className="h-44" /> : (
        <div className="h-44" aria-label={range === 'month' ? 'Траты по дням этого месяца и прошлого' : 'Траты по неделям за 3 месяца'} data-testid="spending-chart">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" minTickGap={12} />
              <Tooltip
                cursor={{ fill: 'var(--muted)' }}
                formatter={(value, name) => [formatMoney(String(value)), name === 'prev' ? 'Прошлый месяц' : range === 'month' ? 'Этот месяц' : 'За неделю']}
                labelFormatter={(label) => (range === 'month' ? `${label}-е число` : `Неделя с ${label}`)}
              />
              <Bar dataKey="amount" fill="var(--primary)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              {range === 'month' && <Line dataKey="prev" type="linear" stroke="var(--muted-foreground)" strokeDasharray="3 3" dot={false} isAnimationActive={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      {range === 'month' && <p className="mt-1 text-xs text-muted-foreground">Столбики — этот месяц, пунктир — прошлый</p>}

      <h3 className="mb-2 mt-4 text-sm font-semibold">Топ категорий месяца</h3>
      {top.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">В этом месяце трат пока нет</p>
      ) : (
        <ul className="space-y-2.5" data-testid="top-categories">
          {top.items.map((item) => (
            <li key={item.categoryId ?? 'none'}>
              <Link
                href={`/transactions?category=${item.categoryId ?? 'none'}&type=expense`}
                onClick={clicked('top_category')}
                className="block rounded-md hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{item.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Delta pct={item.deltaPct} inverse />
                    <span className="font-medium tabular-nums">{formatMoney(item.amount)}</span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, item.share * 100)}%`, background: item.color ?? 'var(--primary)' }} />
                </div>
              </Link>
            </li>
          ))}
          {top.other && (
            <li className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Остальное</span>
              <span className="tabular-nums">{formatMoney(top.other.amount)}</span>
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

// ---------- списания ----------

export function UpcomingBlock({ data, limit }: { data: DashboardSummary; limit?: number }) {
  const today = todayIso();
  const { items, total, days } = data.upcoming;
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <Card title="Ближайшие списания" testId="upcoming-block" action={<AllLink href="/subscriptions" block="upcoming">Все</AllLink>}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">В ближайшие {days} дней регулярных списаний не ожидается</p>
      ) : (
        <>
          <p className="mb-2 text-sm text-muted-foreground">За {days} дней — <span className="font-medium text-foreground tabular-nums">{formatMoney(total)}</span></p>
          <ul className="divide-y">
            {shown.map((item) => (
              <li key={`${item.seriesId}:${item.date}`}>
                <Link href={`/subscriptions?open=${item.seriesId}`} onClick={clicked('upcoming')} className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-muted/40">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">{shortDay(item.date)} · {whenText(daysUntil(item.date, today))}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{formatMoney(item.amount, item.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
          {limit && items.length > limit && <p className="mt-1 text-xs text-muted-foreground">И ещё {items.length - limit}</p>}
        </>
      )}
    </Card>
  );
}

// ---------- бюджеты и цели ----------

export function BudgetsBlock({ data }: { data: DashboardSummary }) {
  const budgets = data.budgets;
  return (
    <Card title="Бюджеты" testId="budgets-block" action={budgets && <AllLink href="/budgets" block="budget">Все бюджеты</AllLink>}>
      {!budgets ? (
        <div className="text-sm">
          <p className="text-muted-foreground">Задайте лимит на главные категории — подскажем, когда тратите быстрее обычного.</p>
          <Button asChild variant="outline" size="sm" className="mt-3"><Link href="/budgets" onClick={clicked('budget')}>Задать бюджет</Link></Button>
        </div>
      ) : (
        <>
          {(budgets.over > 0 || budgets.warning > 0) && (
            <p className="mb-2 text-sm">
              {budgets.over > 0 && <span className="text-destructive">Перерасход: {budgets.over}</span>}
              {budgets.over > 0 && budgets.warning > 0 && ' · '}
              {budgets.warning > 0 && <span className="text-warning">Близко к лимиту: {budgets.warning}</span>}
            </p>
          )}
          <ul className="space-y-3">
            {budgets.top.map((budget) => (
              <li key={budget.id}>
                <Link href="/budgets" onClick={clicked('budget')} className="flex items-center gap-3 rounded-md hover:bg-muted/40">
                  <BudgetIcon budget={budget} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate">{budgetName(budget)}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{budget.percent}%</span>
                    </div>
                    <BudgetProgress budget={budget} month={data.month} className="mt-1" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

export function GoalsBlock({ data }: { data: DashboardSummary }) {
  return (
    <Card title="Цели" testId="goals-block" action={data.goals.length > 0 && <AllLink href="/goals" block="goal">Все цели</AllLink>}>
      {data.goals.length === 0 ? (
        <div className="text-sm">
          <p className="text-muted-foreground">Копите на отпуск или подушку? Посчитаем, сколько откладывать.</p>
          <Button asChild variant="outline" size="sm" className="mt-3"><Link href="/goals" onClick={clicked('goal')}>Поставить цель</Link></Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {data.goals.map((goal) => (
            <li key={goal.id}>
              <Link href="/goals" onClick={clicked('goal')} className="flex items-center gap-3 rounded-md hover:bg-muted/40">
                <GoalIcon goal={goal} className="size-8" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="truncate">{goal.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatMoney(goal.currentAmount)} из {formatMoney(goal.targetAmount)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(goal.percent, 100)}%` }} />
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------- последние операции ----------

export function RecentBlock({ limit }: { limit: number }) {
  const feed = useTransactionFeed({}, 10);
  const categories = useCategories();
  const items = feed.data?.pages[0].items.slice(0, limit) ?? [];
  const today = todayIso();
  const dayLabel = (iso: string) => (iso === today ? 'Сегодня' : iso === addDays(today, -1) ? 'Вчера' : formatDate(iso));
  return (
    <Card title="Последние операции" testId="recent-block" action={<AllLink href="/transactions" block="recent_tx">Все операции</AllLink>}>
      {feed.isError ? <BlockError error={feed.error} onRetry={() => feed.refetch()} />
        : feed.isPending ? <Skeleton className="h-40" />
        : items.length === 0 ? <p className="text-sm text-muted-foreground">Операций пока нет</p>
        : (
          <ul className="divide-y">
            {items.map((tx) => {
              const negative = tx.amount.startsWith('-');
              const category = tx.categoryId ? categories.data?.byId.get(tx.categoryId) : undefined;
              // у операции без описания заголовок — категория, чтобы строка не была пустой
              const title = tx.merchant || tx.description || category?.name || 'Операция';
              return (
                <li key={tx.id} className="flex items-center gap-3 py-2">
                  <CategoryIcon category={category} type={tx.type} className="size-8" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate">{title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {dayLabel(tx.date)}{category && category.name !== title ? ` · ${category.name}` : ''}
                    </p>
                  </div>
                  <span className={cn('shrink-0 text-sm font-medium tabular-nums', !negative && tx.type === 'income' && 'text-success')}>
                    {formatMoney(tx.amount, tx.currency, { signed: !negative })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
    </Card>
  );
}
