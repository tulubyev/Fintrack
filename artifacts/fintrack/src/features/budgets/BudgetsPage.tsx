/**
 * Экран бюджетов (E1.4-T4): месяц, сводка с темпом, карточки по проценту исполнения, «без бюджета»,
 * пустое состояние с предложениями по тратам за 3 месяца. Месяц — в адресе (?month=), туда ведут уведомления о порогах.
 */
import { useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { ChevronLeft, ChevronRight, PieChart, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { CategorySelect } from '@/features/transactions/CategorySelect';
import { errorMessage } from '@/lib/api';
import { formatMoney, fromKopecks, todayIso, toKopecks } from '@workspace/shared/money';
import { BudgetCard } from './BudgetCard';
import { BudgetForm } from './BudgetForm';
import { BudgetSuggestions } from './BudgetSuggestions';
import { currentMonth, daysInMonth, isMonth, monthTitle, shiftMonth, useBudgets, useBudgetSuggestions, type BudgetsMonth } from './api';

export function useBudgetMonth(): [string, (month: string) => void] {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const raw = new URLSearchParams(search).get('month');
  const month = isMonth(raw) ? raw : currentMonth();
  return [month, (next) => navigate(next === currentMonth() ? location : `${location}?month=${next}`, { replace: true })];
}

export function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="flex items-center gap-1" data-testid="month-switcher">
      <Button variant="ghost" size="icon" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Предыдущий месяц"><ChevronLeft className="size-5" /></Button>
      <span className="min-w-[9.5rem] text-center font-medium" data-testid="month-title">{monthTitle(month)}</span>
      <Button variant="ghost" size="icon" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Следующий месяц"><ChevronRight className="size-5" /></Button>
    </div>
  );
}

const plural = (n: number, forms: [string, string, string]) => {
  const mod10 = n % 10, mod100 = n % 100;
  return forms[mod10 === 1 && mod100 !== 11 ? 0 : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 1 : 2];
};

/** «Потрачено 64 300 из 80 000 ₽ · осталось 15 700 ₽ на 14 дней (≈ 1 120 ₽/день)» */
function Summary({ data }: { data: BudgetsMonth }) {
  const { month, total } = data;
  const left = toKopecks(total.remaining);
  let tail: string;
  if (left < 0n) {
    tail = `перерасход ${formatMoney(fromKopecks(-left))}`;
  } else if (month === currentMonth()) {
    const daysLeft = daysInMonth(month) - Number(todayIso().slice(8, 10)) + 1;
    const perDay = left / BigInt(daysLeft) / 100n * 100n; // до рубля вниз
    tail = `осталось ${formatMoney(total.remaining)} на ${daysLeft} ${plural(daysLeft, ['день', 'дня', 'дней'])} (≈ ${formatMoney(fromKopecks(perDay))}/день)`;
  } else {
    tail = month < currentMonth() ? `сэкономлено ${formatMoney(total.remaining)}` : `лимит на месяц`;
  }
  return (
    <section className="mb-4 rounded-xl border bg-card p-4" data-testid="budgets-summary">
      <p className="text-sm text-muted-foreground">Потрачено</p>
      <p className="text-2xl font-semibold tabular-nums">
        {formatMoney(total.spent)} <span className="text-base font-normal text-muted-foreground">из {formatMoney(total.amount)}</span>
      </p>
      <p className={left < 0n ? 'mt-1 text-sm font-medium text-destructive' : 'mt-1 text-sm text-muted-foreground'}>{tail}</p>
    </section>
  );
}

function EmptyState({ month, onCreate }: { month: string; onCreate: (categoryId?: string | null) => void }) {
  const canSuggest = month >= currentMonth();
  const suggestions = useBudgetSuggestions(canSuggest);

  if (!canSuggest) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center" data-testid="budgets-empty-past">
        <p className="font-medium">В месяце «{monthTitle(month)}» бюджетов не было</p>
        <Button className="mt-4" variant="outline" onClick={() => onCreate()}>Задать бюджет на этот месяц</Button>
      </div>
    );
  }
  if (suggestions.isPending) return <Skeleton className="h-64 rounded-xl" />;
  if (suggestions.data && suggestions.data.length > 0) {
    return <BudgetSuggestions suggestions={suggestions.data} month={month} onManual={() => onCreate()} />;
  }
  return (
    <div className="rounded-xl border bg-card p-6 md:p-10" data-testid="budgets-empty">
      <div className="mx-auto max-w-md text-center">
        <PieChart className="mx-auto size-10 text-muted-foreground" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold">Бюджеты помогают не выходить за лимит. Задайте первый</h2>
        <p className="mt-1 text-sm text-muted-foreground">Выберите категорию — например, «Кафе и рестораны» — и сумму на месяц. Предупредим на 80% и 100%.</p>
        <div className="mx-auto mt-5 max-w-xs text-left">
          <CategorySelect
            value={undefined}
            onChange={(categoryId) => onCreate(categoryId)}
            kind="expense"
            placeholder="Выберите категорию"
            noneLabel="Общий бюджет — все расходы"
            testId="budgets-empty-category"
          />
        </div>
      </div>
    </div>
  );
}

export function BudgetsPage() {
  const [month, setMonth] = useBudgetMonth();
  const budgets = useBudgets(month);
  const [form, setForm] = useState<{ open: boolean; categoryId?: string | null }>({ open: false });
  const openForm = (categoryId?: string | null) => setForm({ open: true, categoryId });

  const actions = <Button onClick={() => openForm()} data-testid="add-budget"><Plus className="mr-2 size-4" />Добавить бюджет</Button>;

  let content;
  if (budgets.isPending) {
    content = (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-28 rounded-xl" />
        {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  } else if (budgets.isError) {
    content = (
      <div className="rounded-xl border bg-card p-6 text-center" data-testid="budgets-error">
        <p className="font-medium">Не удалось загрузить бюджеты</p>
        <p className="mt-1 text-sm text-muted-foreground">{errorMessage(budgets.error)}</p>
        <Button className="mt-4" variant="outline" onClick={() => budgets.refetch()}>Повторить</Button>
      </div>
    );
  } else if (budgets.data.items.length === 0) {
    content = <EmptyState month={month} onCreate={openForm} />;
  } else {
    const { items, unbudgetedSpent } = budgets.data;
    const hasCategoryBudgets = items.some((item) => item.categoryId);
    const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
    content = (
      <>
        <Summary data={budgets.data} />
        <div className="space-y-3" data-testid="budget-list">
          {items.map((budget) => <BudgetCard key={budget.id} budget={budget} month={month} />)}
        </div>
        {hasCategoryBudgets && toKopecks(unbudgetedSpent) > 0n && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-dashed p-4 text-sm" data-testid="budgets-unbudgeted">
            <span>Без бюджета: <span className="font-medium tabular-nums">{formatMoney(unbudgetedSpent)}</span></span>
            <Link href={`/transactions?period=custom&from=${month}-01&to=${lastDay}&type=expense`} className="text-primary hover:underline">Операции</Link>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Бюджеты" actions={actions} />
      <div className="mb-4 flex justify-center sm:justify-start">
        <MonthSwitcher month={month} onChange={setMonth} />
      </div>
      {content}
      <BudgetForm open={form.open} onOpenChange={(open) => setForm((current) => ({ ...current, open }))} month={month} presetCategoryId={form.categoryId} />
    </div>
  );
}
