import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { CategoryIcon } from '@/features/transactions/CategoryIcon';
import { useCategories } from '@/features/transactions/api';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { formatMoney, parseMoneyInput } from '@workspace/shared/money';
import { useCreateBudgets, type BudgetSuggestion } from './api';

interface Row {
  checked: boolean;
  amount: string;
}

/** «Мы посмотрели ваши траты за 3 месяца»: предложения с галочками и правкой сумм, создание одним запросом. */
export function BudgetSuggestions({ suggestions, month, onManual }: { suggestions: BudgetSuggestion[]; month: string; onManual: () => void }) {
  const categories = useCategories();
  const createMany = useCreateBudgets();
  const { toast } = useToast();
  const [rows, setRows] = useState<Record<string, Row>>({});

  useEffect(() => {
    setRows(Object.fromEntries(suggestions.map((item) => [item.categoryId, { checked: true, amount: item.suggestedAmount.replace(/\.00$/, '') }])));
  }, [suggestions]);

  const set = (id: string, patch: Partial<Row>) => setRows((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  const chosen = suggestions.filter((item) => rows[item.categoryId]?.checked);
  const invalid = chosen.some((item) => {
    const value = parseMoneyInput(rows[item.categoryId].amount, { allowNegative: false });
    return value === null || Number(value) <= 0;
  });

  async function submit() {
    const items = chosen.map((item) => ({ categoryId: item.categoryId, amount: parseMoneyInput(rows[item.categoryId].amount, { allowNegative: false })! }));
    try {
      const { created } = await createMany.mutateAsync({ items, fromMonth: month });
      toast({ title: created.length === 1 ? 'Бюджет создан' : `Создано бюджетов: ${created.length}` });
    } catch (error) {
      toast({ title: 'Не удалось создать бюджеты', description: errorMessage(error), variant: 'destructive' });
    }
  }

  return (
    <section className="rounded-xl border bg-card p-4 md:p-6" data-testid="budget-suggestions">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold">Мы посмотрели ваши траты за 3 месяца и предлагаем бюджеты</h2>
          <p className="mt-1 text-sm text-muted-foreground">Сумма — ваши обычные траты в месяц, округлённые вверх до 500 ₽. Поправьте, если нужно.</p>
        </div>
      </div>
      <ul className="mt-4 divide-y">
        {suggestions.map((item) => {
          const row = rows[item.categoryId];
          const category = categories.data?.byId.get(item.categoryId);
          return (
            <li key={item.categoryId} className="flex items-center gap-3 py-2.5" data-testid="budget-suggestion">
              <Checkbox
                checked={row?.checked ?? false}
                onCheckedChange={(checked) => set(item.categoryId, { checked: checked === true })}
                aria-label={category?.name ?? 'Категория'}
              />
              <CategoryIcon category={category} type="expense" className="size-8" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{category?.name ?? 'Категория'}</div>
                <div className="text-xs text-muted-foreground">обычно {formatMoney(item.median3m)} в месяц</div>
              </div>
              <div className="relative w-28 shrink-0">
                <Input
                  inputMode="decimal"
                  value={row?.amount ?? ''}
                  onChange={(e) => set(item.categoryId, { amount: e.target.value })}
                  disabled={!row?.checked}
                  className="pr-6 text-right tabular-nums"
                  aria-label={`Лимит: ${category?.name ?? 'категория'}`}
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₽</span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" onClick={onManual}>Задать вручную</Button>
        <Button onClick={submit} disabled={!chosen.length || invalid || createMany.isPending} data-testid="budget-suggestions-submit">
          {createMany.isPending ? 'Создаём…' : chosen.length ? `Создать выбранные (${chosen.length})` : 'Создать выбранные'}
        </Button>
      </div>
    </section>
  );
}
