import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import { useAccounts } from '@/features/accounts/api';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { formatMoney, parseMoneyInput, todayIso } from '@workspace/shared/money';
import { cn } from '@/lib/utils';
import { GOAL_ICONS, useCreateGoal, useUpdateGoal, type Goal } from './api';
import { goalIconComponent } from './GoalVisuals';

export interface GoalPreset {
  name?: string;
  icon?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal?: Goal;
  preset?: GoalPreset;
}

// Копить можно на счетах с положительным остатком в рублях (то же правило проверяет сервер)
const LINKABLE = new Set(['debit_card', 'current', 'cash', 'savings', 'deposit', 'brokerage', 'iis', 'digital_ruble', 'other']);
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined);
const plainAmount = (amount: string) => amount.replace(/\.00$/, '').replace('.', ',');

export function GoalForm({ open, onOpenChange, goal, preset }: Props) {
  const isEdit = Boolean(goal);
  const { toast } = useToast();
  const accounts = useAccounts();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const saving = create.isPending || update.isPending;

  const [requestId, setRequestId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [icon, setIcon] = useState<string>('piggy-bank');
  const [source, setSource] = useState<'manual' | 'account'>('manual');
  const [accountId, setAccountId] = useState<string | undefined>();
  const [onlyNew, setOnlyNew] = useState(false);
  const [initial, setInitial] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setRequestId(newId());
    setErrors({});
    setName(goal?.name ?? preset?.name ?? '');
    setTarget(goal ? plainAmount(goal.targetAmount) : '');
    setTargetDate(goal?.targetDate ?? '');
    setIcon(goal?.icon ?? preset?.icon ?? 'piggy-bank');
    setSource(goal?.accountId ? 'account' : 'manual');
    setAccountId(goal?.accountId ?? undefined);
    setOnlyNew(goal?.countOnlyNewMoney ?? false);
    setInitial('');
  }, [open, goal, preset]);

  const linkable = useMemo(
    () => (accounts.data?.items ?? []).filter((item) => LINKABLE.has(item.kind) && item.currency === 'RUB' && !item.archivedAt),
    [accounts.data],
  );
  const today = todayIso();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Введите название';
    const targetAmount = parseMoneyInput(target, { allowNegative: false });
    if (targetAmount === null || Number(targetAmount) <= 0) next.target = 'Сумма больше нуля, например 150 000';
    if (targetDate && targetDate < today) next.targetDate = 'Срок — сегодня или позже';
    if (source === 'account' && !accountId) next.account = 'Выберите счёт';
    const initialAmount = !isEdit && source === 'manual' && initial.trim() ? parseMoneyInput(initial, { allowNegative: false }) : undefined;
    if (initialAmount === null) next.initial = 'Сумма в формате 12 345';
    setErrors(next);
    if (Object.keys(next).length) return;

    const fields = {
      name: name.trim(),
      targetAmount: targetAmount!,
      targetDate: targetDate || null,
      icon,
      accountId: source === 'account' ? accountId! : null,
      countOnlyNewMoney: source === 'account' ? onlyNew : undefined,
    };
    try {
      if (goal) {
        await update.mutateAsync({ id: goal.id, ...fields });
        toast({ title: 'Цель сохранена' });
      } else {
        await create.mutateAsync({ id: requestId, ...fields, ...(initialAmount ? { initialAmount } : {}) });
        toast({ title: 'Цель создана' });
      }
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Не удалось сохранить', description: errorMessage(error), variant: 'destructive' });
    }
  }

  const unlinking = Boolean(goal?.accountId) && source === 'manual';

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={isEdit ? 'Изменить цель' : 'Новая цель'}>
      <form onSubmit={submit} className="grid gap-4" noValidate data-testid="goal-form">
        <div className="grid gap-2">
          <Label htmlFor="goal-name">Название</Label>
          <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Например, Отпуск" autoFocus={!isEdit} aria-invalid={Boolean(errors.name)} />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>

        <div className="grid gap-2">
          <Label>Значок</Label>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Значок цели">
            {GOAL_ICONS.map((value) => {
              const Icon = goalIconComponent(value);
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={icon === value}
                  aria-label={value}
                  onClick={() => setIcon(value)}
                  className={cn('flex size-10 items-center justify-center rounded-full border transition-colors', icon === value ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}
                >
                  <Icon className="size-5" />
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="goal-target">Сколько нужно, ₽</Label>
            <Input id="goal-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="150 000" aria-invalid={Boolean(errors.target)} data-testid="goal-target" />
            {errors.target && <p className="text-sm text-destructive">{errors.target}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="goal-date">К какому сроку</Label>
            <Input id="goal-date" type="date" min={today} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} aria-invalid={Boolean(errors.targetDate)} data-testid="goal-date" />
            {errors.targetDate ? <p className="text-sm text-destructive">{errors.targetDate}</p> : <p className="text-xs text-muted-foreground">Необязательно — без срока покажем только прогноз</p>}
          </div>
        </div>

        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Как считать накопленное</legend>
          <RadioGroup value={source} onValueChange={(value) => setSource(value as 'manual' | 'account')} className="grid gap-2">
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value="manual" className="mt-0.5" data-testid="goal-source-manual" />
              <span>
                <span className="block text-sm font-medium">Взносами</span>
                <span className="block text-xs text-muted-foreground">Отмечаете пополнения вручную</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value="account" className="mt-0.5" data-testid="goal-source-account" disabled={!linkable.length && !goal?.accountId} />
              <span>
                <span className="block text-sm font-medium">По остатку счёта</span>
                <span className="block text-xs text-muted-foreground">
                  {linkable.length ? 'Например, накопительный счёт — прогресс считается сам' : 'Нет подходящих счетов: нужен рублёвый счёт, не кредитный'}
                </span>
              </span>
            </label>
          </RadioGroup>
        </fieldset>

        {source === 'account' && (
          <div className="grid gap-3">
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger data-testid="goal-account" aria-invalid={Boolean(errors.account)}><SelectValue placeholder="Выберите счёт" /></SelectTrigger>
              <SelectContent>
                {linkable.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.name} · {formatMoney(item.balance, item.currency)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.account && <p className="text-sm text-destructive">{errors.account}</p>}
            <label className="flex items-start gap-2 text-sm">
              <Checkbox checked={onlyNew} onCheckedChange={(value) => setOnlyNew(value === true)} className="mt-0.5" data-testid="goal-only-new" />
              <span>
                Считать только новые деньги
                <span className="block text-xs text-muted-foreground">Текущий остаток не войдёт в цель, только то, что придёт на счёт дальше</span>
              </span>
            </label>
          </div>
        )}

        {unlinking && (
          <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Накопленное по счёту сохранится в цели взносом «Перенос остатка», дальше пополняйте вручную.
          </p>
        )}

        {!isEdit && source === 'manual' && (
          <div className="grid gap-2">
            <Label htmlFor="goal-initial">Уже накоплено, ₽</Label>
            <Input id="goal-initial" inputMode="decimal" value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="0" aria-invalid={Boolean(errors.initial)} data-testid="goal-initial" />
            {errors.initial && <p className="text-sm text-destructive">{errors.initial}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button type="submit" disabled={saving} data-testid="goal-submit">{saving ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Создать'}</Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
