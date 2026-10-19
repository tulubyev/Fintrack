import { Link } from 'wouter';
import { RefreshCw, Wallet } from 'lucide-react';
import { CategoryIcon } from '@/features/transactions/CategoryIcon';
import { useCategories } from '@/features/transactions/api';
import { formatMoney, fromKopecks, toKopecks } from '@/lib/money';
import { cn } from '@/lib/utils';
import { currentMonth, type BudgetState, type BudgetStatus } from './api';

const BAR: Record<BudgetState, string> = { ok: 'bg-success', warning: 'bg-warning', over: 'bg-destructive' };

export const budgetName = (budget: Pick<BudgetStatus, 'category'>) => budget.category?.name ?? 'Общий бюджет';

/** Доля от лимита в процентах для ширины полосы (0–100). */
const share = (part: string, whole: string) => {
  const limit = toKopecks(whole);
  if (limit <= 0n) return 0;
  return Math.min(100, Math.max(0, Number((toKopecks(part) * 1000n) / limit) / 10));
};

/** Полоса исполнения 8 px с отметкой «ожидаемо на сегодня» (только в текущем месяце). */
export function BudgetProgress({ budget, month, className }: { budget: BudgetStatus; month: string; className?: string }) {
  const width = share(budget.spent, budget.effectiveAmount);
  const expected = month === currentMonth() ? share(budget.expectedByToday, budget.effectiveAmount) : null;
  return (
    <div
      className={cn('relative h-2 rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(budget.percent, 100)}
      aria-label={`Потрачено ${budget.percent}%`}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-500', BAR[budget.status])} style={{ width: `${width}%` }} />
      {expected !== null && expected > 0 && expected < 100 && (
        <div className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60" style={{ left: `${expected}%` }} title="Ожидаемо на сегодня" aria-hidden />
      )}
    </div>
  );
}

export function BudgetIcon({ budget, className }: { budget: BudgetStatus; className?: string }) {
  const categories = useCategories();
  if (!budget.categoryId) {
    return (
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary', className)} aria-hidden>
        <Wallet className="size-[18px]" />
      </span>
    );
  }
  return <CategoryIcon category={categories.data?.byId.get(budget.categoryId)} type="expense" className={className} />;
}

function Remaining({ budget }: { budget: BudgetStatus }) {
  const left = toKopecks(budget.remaining);
  return left >= 0n
    ? <span className="text-muted-foreground">осталось {formatMoney(budget.remaining)}</span>
    : <span className="font-medium text-destructive">перерасход {formatMoney(fromKopecks(-left))}</span>;
}

export function BudgetCard({ budget, month }: { budget: BudgetStatus; month: string }) {
  const carried = toKopecks(budget.effectiveAmount) - toKopecks(budget.amount);
  const href = (item: BudgetStatus) => `/budgets/${item.id}?month=${month}`;
  return (
    <article className="rounded-xl border bg-card" data-testid="budget-card" data-status={budget.status}>
      <Link href={href(budget)} className="block rounded-xl p-4 transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-3">
          <BudgetIcon budget={budget} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate font-medium">{budgetName(budget)}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{budget.percent}%</span>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
              <span className="tabular-nums">
                {formatMoney(budget.spent)} <span className="text-muted-foreground">из {formatMoney(budget.effectiveAmount)}</span>
              </span>
              <Remaining budget={budget} />
            </div>
          </div>
        </div>
        <BudgetProgress budget={budget} month={month} className="mt-3" />
        {budget.rollover && carried > 0n && (
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <RefreshCw className="size-3" aria-hidden />с переносом остатка +{formatMoney(fromKopecks(carried))}
          </p>
        )}
      </Link>
      {budget.children && budget.children.length > 0 && (
        <ul className="divide-y border-t">
          {budget.children.map((child) => (
            <li key={child.id}>
              <Link href={href(child)} className="flex items-center gap-3 px-4 py-2.5 pl-8 transition-colors hover:bg-muted/50" data-testid="budget-child">
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{budgetName(child)}</span>
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(child.spent)} <span className="text-muted-foreground">из {formatMoney(child.effectiveAmount)}</span>
                    </span>
                  </span>
                  <BudgetProgress budget={child} month={month} className="mt-1.5 h-1.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
