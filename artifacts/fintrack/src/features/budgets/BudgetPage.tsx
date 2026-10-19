/**
 * Карточка бюджета (E1.4-T4): траты по дням против лимита, перенос остатка, правка, удаление с месяца,
 * операции месяца по категории бюджета.
 */
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/layout/PageHeader';
import { TransactionFeed } from '@/features/transactions/TransactionFeed';
import { TransactionSheet } from '@/features/transactions/TransactionSheet';
import type { Transaction, TransactionFilters } from '@/features/transactions/api';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { formatMoney, fromKopecks, toKopecks } from '@/lib/money';
import { BudgetForm } from './BudgetForm';
import { BudgetIcon, BudgetProgress, budgetName } from './BudgetCard';
import { MonthSwitcher, useBudgetMonth } from './BudgetsPage';
import {
  currentMonth, daysInMonth, monthGenitive, monthPrepositional, monthTitle, shiftMonth, useBudgetDaily, useBudgets, useDeleteBudget, useUpdateBudget,
  type BudgetStatus,
} from './api';

const rubles = (amount: string) => Number(toKopecks(amount) / 100n);
const axisMoney = (value: number) => (value >= 1000 ? `${Math.round(value / 1000)} тыс` : String(value));

function SpendingChart({ budget, month }: { budget: BudgetStatus; month: string }) {
  const daily = useBudgetDaily(budget.id, month);
  const data = useMemo(() => {
    if (!daily.data) return [];
    const limit = rubles(daily.data.amount);
    const total = daily.data.daysInMonth;
    return Array.from({ length: total }, (_, i) => {
      const day = daily.data.days[i];
      return { day: i + 1, spent: day ? rubles(day.cumulative) : undefined, pace: Math.round((limit * (i + 1)) / total) };
    });
  }, [daily.data]);

  if (daily.isPending) return <Skeleton className="h-56 rounded-xl" />;
  if (daily.isError) return <p className="py-10 text-center text-sm text-muted-foreground">Не удалось загрузить график: {errorMessage(daily.error)}</p>;

  const limit = rubles(daily.data.amount);
  return (
    <div className="h-56" data-testid="budget-chart" aria-label="Траты по дням нарастающим итогом и линия лимита">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} tickFormatter={axisMoney} width={56} />
          <Tooltip
            formatter={(value: number, name: string) => [formatMoney(String(value)), name === 'spent' ? 'Потрачено' : 'Темп по лимиту']}
            labelFormatter={(day: number) => `${day} ${monthGenitive(month)}`}
            contentStyle={{ borderRadius: 8, borderColor: 'var(--border)', background: 'var(--popover)', fontSize: 12 }}
          />
          <ReferenceLine y={limit} stroke="var(--destructive)" strokeDasharray="4 4" label={{ value: 'лимит', position: 'insideTopRight', fontSize: 11, fill: 'var(--destructive)' }} />
          <Line type="linear" dataKey="pace" stroke="var(--muted-foreground)" strokeDasharray="2 4" dot={false} isAnimationActive={false} />
          <Line type="linear" dataKey="spent" stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DeleteDialog({ budget, month, open, onOpenChange }: { budget: BudgetStatus; month: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const remove = useDeleteBudget();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const next = shiftMonth(month, 1);

  async function run(fromMonth: string) {
    try {
      await remove.mutateAsync({ id: budget.id, fromMonth });
      toast({ title: fromMonth === month ? 'Бюджет удалён' : `Бюджета не будет с ${monthGenitive(fromMonth)}` });
      onOpenChange(false);
      if (fromMonth === month) navigate(month === currentMonth() ? '/budgets' : `/budgets?month=${month}`);
    } catch (error) {
      toast({ title: 'Не удалось удалить', description: errorMessage(error), variant: 'destructive' });
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить бюджет «{budgetName(budget)}»?</AlertDialogTitle>
          <AlertDialogDescription>Прошлые месяцы и их история не меняются.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:flex-wrap">
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <Button variant="outline" onClick={() => void run(next)} disabled={remove.isPending} data-testid="budget-delete-next">
            С {monthGenitive(next)}
          </Button>
          <Button variant="destructive" onClick={() => void run(month)} disabled={remove.isPending} data-testid="budget-delete-now">
            Уже в {monthPrepositional(month)}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function findBudget(items: BudgetStatus[], id: string): BudgetStatus | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const child = item.children?.find((c) => c.id === id);
    if (child) return child;
  }
  return undefined;
}

export function BudgetPage({ id }: { id: string }) {
  const [month, setMonth] = useBudgetMonth();
  const budgets = useBudgets(month);
  const update = useUpdateBudget();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [opened, setOpened] = useState<Transaction | null>(null);
  const backHref = month === currentMonth() ? '/budgets' : `/budgets?month=${month}`;
  const back = (
    <Link href={backHref} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />Бюджеты
    </Link>
  );

  if (budgets.isPending) {
    return <div className="mx-auto max-w-3xl space-y-4" aria-busy="true"><Skeleton className="h-8 w-56" /><Skeleton className="h-40 rounded-xl" /><Skeleton className="h-60 rounded-xl" /></div>;
  }
  if (budgets.isError) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border bg-card p-6 text-center">
        <p className="font-medium">Не удалось загрузить бюджет</p>
        <Button className="mt-4" variant="outline" onClick={() => budgets.refetch()}>Повторить</Button>
      </div>
    );
  }

  const budget = findBudget(budgets.data.items, id);
  if (!budget) {
    return (
      <div className="mx-auto max-w-3xl">
        {back}
        <div className="mb-4 flex justify-center sm:justify-start">
          <MonthSwitcher month={month} onChange={setMonth} />
        </div>
        <div className="rounded-xl border bg-card p-6 text-center" data-testid="budget-missing">
          <p className="font-medium">В месяце «{monthTitle(month)}» этого бюджета нет</p>
          <p className="mt-1 text-sm text-muted-foreground">Он мог начаться позже, закончиться раньше или быть изменён — откройте его из списка.</p>
          <Button className="mt-4" variant="outline" asChild><Link href={backHref}>К бюджетам</Link></Button>
        </div>
      </div>
    );
  }

  const left = toKopecks(budget.remaining);
  const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
  const filters: TransactionFilters = budget.categoryId
    ? { categoryId: [budget.categoryId], from: `${month}-01`, to: lastDay }
    : { type: ['expense'], from: `${month}-01`, to: lastDay };
  const feedHref = `/transactions?period=custom&from=${month}-01&to=${lastDay}&${budget.categoryId ? `category=${budget.categoryId}` : 'type=expense'}`;

  async function toggleRollover(rollover: boolean) {
    try {
      await update.mutateAsync({ id: budget!.id, rollover, fromMonth: month });
    } catch (error) {
      toast({ title: 'Не удалось сохранить', description: errorMessage(error), variant: 'destructive' });
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      {back}
      <PageHeader title={budgetName(budget)} />
      <div className="mb-4 flex justify-center sm:justify-start">
        <MonthSwitcher month={month} onChange={setMonth} />
      </div>

      <section className="mb-6 rounded-xl border bg-card p-4 md:p-6" data-testid="budget-detail">
        <div className="flex items-start gap-4">
          <BudgetIcon budget={budget} className="size-12" />
          <div className="min-w-0 flex-1">
            <div className="text-2xl font-semibold tabular-nums">
              {formatMoney(budget.spent)} <span className="text-base font-normal text-muted-foreground">из {formatMoney(budget.effectiveAmount)}</span>
            </div>
            <div className={left < 0n ? 'text-sm font-medium text-destructive' : 'text-sm text-muted-foreground'}>
              {left < 0n ? `Перерасход ${formatMoney(fromKopecks(-left))}` : `Осталось ${formatMoney(budget.remaining)}`} · {budget.percent}%
              {month === currentMonth() && ` · по темпу к сегодня ${formatMoney(fromKopecks((toKopecks(budget.expectedByToday) / 100n) * 100n))}`}
            </div>
          </div>
        </div>
        <BudgetProgress budget={budget} month={month} className="mt-4" />

        <div className="mt-6"><SpendingChart budget={budget} month={month} /></div>

        <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="block text-sm font-medium">Перенос остатка</span>
            <span className="block text-xs text-muted-foreground">
              {budget.amount !== budget.effectiveAmount ? `Лимит ${formatMoney(budget.amount)} + остаток прошлого месяца` : 'Неистраченное прибавляется к лимиту следующего месяца'}
            </span>
          </span>
          <Switch checked={budget.rollover} onCheckedChange={(value) => void toggleRollover(value)} disabled={update.isPending} data-testid="budget-detail-rollover" />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setEditOpen(true)} data-testid="budget-edit"><Pencil className="mr-2 size-4" />Изменить</Button>
          <Button variant="outline" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive" data-testid="budget-delete">
            <Trash2 className="mr-2 size-4" />Удалить
          </Button>
        </div>
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{budget.categoryId ? 'Операции месяца' : 'Расходы месяца'}</h2>
        <Link href={feedHref} className="text-sm font-medium text-primary hover:underline">С фильтрами</Link>
      </div>
      <TransactionFeed
        filters={filters}
        onOpen={setOpened}
        empty={<div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">В этом месяце операций по бюджету нет</div>}
      />
      <TransactionSheet tx={opened} onClose={() => setOpened(null)} />

      <BudgetForm open={editOpen} onOpenChange={setEditOpen} month={month} budget={budget} />
      <DeleteDialog budget={budget} month={month} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </div>
  );
}
