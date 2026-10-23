import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import { CategorySelect } from '@/features/transactions/CategorySelect';
import { useCategories } from '@/features/transactions/api';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { parseMoneyInput } from '@workspace/shared/money';
import { budgetName } from './BudgetCard';
import { monthGenitive, monthTitle, useCreateBudget, useUpdateBudget, type BudgetStatus } from './api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Месяц, с которого действует новый бюджет или правка */
  month: string;
  /** Правка; без него — создание */
  budget?: BudgetStatus;
  /** Категория, выбранная до открытия формы (пустой экран) */
  presetCategoryId?: string | null;
}

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined);
const plainAmount = (amount: string) => amount.replace(/\.00$/, '').replace('.', ',');

export function BudgetForm({ open, onOpenChange, month, budget, presetCategoryId }: Props) {
  const isEdit = Boolean(budget);
  const { toast } = useToast();
  const categories = useCategories();
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const saving = create.isPending || update.isPending;

  const [requestId, setRequestId] = useState<string | undefined>();
  const [categoryId, setCategoryId] = useState<string | null | undefined>(undefined);
  const [amount, setAmount] = useState('');
  const [rollover, setRollover] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setRequestId(newId());
    setErrors({});
    setCategoryId(budget ? budget.categoryId : presetCategoryId);
    setAmount(budget ? plainAmount(budget.amount) : '');
    setRollover(budget?.rollover ?? false);
    setExcluded(budget?.excludedCategoryIds ?? []);
  }, [open, budget, presetCategoryId]);

  const isTotal = categoryId === null;
  const expenseParents = (categories.data?.tree ?? []).filter((node) => node.kind === 'expense' && !node.hidden);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!isEdit && categoryId === undefined) nextErrors.category = 'Выберите категорию или общий бюджет';
    const value = parseMoneyInput(amount, { allowNegative: false });
    if (value === null || Number(value) <= 0) nextErrors.amount = 'Сумма больше нуля, например 15 000';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    try {
      if (budget) {
        await update.mutateAsync({ id: budget.id, amount: value!, rollover, fromMonth: month, ...(isTotal ? { excludedCategoryIds: excluded } : {}) });
        toast({ title: 'Бюджет сохранён' });
      } else {
        await create.mutateAsync({
          id: requestId, categoryId: categoryId!, amount: value!, rollover, fromMonth: month,
          ...(isTotal ? { excludedCategoryIds: excluded } : {}),
        });
        toast({ title: 'Бюджет добавлен' });
      }
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Не удалось сохранить', description: errorMessage(error), variant: 'destructive' });
    }
  }

  const toggleExcluded = (id: string, checked: boolean) =>
    setExcluded((current) => (checked ? [...current, id] : current.filter((item) => item !== id)));

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={budget ? `Бюджет «${budgetName(budget)}»` : 'Новый бюджет'}
      description={budget
        ? `Изменения действуют с ${monthGenitive(month)} — прошлые месяцы не меняются`
        : `Лимит на месяц, начиная с месяца «${monthTitle(month)}»`}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate data-testid="budget-form">
        {!isEdit && (
          <div className="grid gap-2">
            <Label>Категория</Label>
            <CategorySelect
              value={categoryId}
              onChange={setCategoryId}
              kind="expense"
              placeholder="Выберите категорию"
              noneLabel="Общий бюджет — все расходы"
              testId="budget-category"
            />
            {errors.category && <p className="text-sm text-destructive">{errors.category}</p>}
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="budget-amount">Лимит на месяц, ₽</Label>
          <Input
            id="budget-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="15 000"
            autoFocus={isEdit}
            aria-invalid={Boolean(errors.amount)}
            data-testid="budget-amount"
          />
          {errors.amount && <p className="text-sm text-destructive">{errors.amount}</p>}
        </div>

        <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="block text-sm font-medium">Переносить остаток</span>
            <span className="block text-xs text-muted-foreground">Недотратили 3 000 ₽ — в следующем месяце лимит больше на 3 000 ₽. Перерасход лимит не уменьшает.</span>
          </span>
          <Switch checked={rollover} onCheckedChange={setRollover} data-testid="budget-rollover" />
        </label>

        {isTotal && (
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Не учитывать в общем бюджете</legend>
            <p className="text-xs text-muted-foreground">Например, обязательные платежи: жильё, кредиты.</p>
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
              {expenseParents.map((node) => (
                <label key={node.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <Checkbox checked={excluded.includes(node.id)} onCheckedChange={(checked) => toggleExcluded(node.id, checked === true)} />
                  {node.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button type="submit" disabled={saving} data-testid="budget-submit">{saving ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Добавить'}</Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
