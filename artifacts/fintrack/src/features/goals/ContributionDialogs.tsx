import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import { useAccounts } from '@/features/accounts/api';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney, parseMoneyInput, todayIso } from '@/lib/money';
import { cn } from '@/lib/utils';
import { useAddContribution, useContributions, useDeleteContribution, type Goal } from './api';

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined);

/** «Пополнить»: взнос или снятие; для цели со счётом — подсказка перевести деньги на счёт. */
export function ContributionDialog({ goal, onOpenChange }: { goal: Goal | null; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const accounts = useAccounts(true);
  const add = useAddContribution();
  const [requestId, setRequestId] = useState<string | undefined>();
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!goal) return;
    setRequestId(newId());
    setDirection('in');
    setAmount('');
    setDate(todayIso());
    setNote('');
    setError(null);
  }, [goal]);

  if (!goal) return null;
  const account = goal.accountId ? accounts.data?.items.find((item) => item.id === goal.accountId) : undefined;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = parseMoneyInput(amount, { allowNegative: false });
    if (value === null || Number(value) <= 0) return setError('Сумма больше нуля, например 5 000');
    if (date > todayIso()) return setError('Дата — не позже сегодня');
    setError(null);
    try {
      const { goal: updated } = await add.mutateAsync({
        goalId: goal!.id, id: requestId, amount: direction === 'out' ? `-${value}` : value, date, note: note.trim() || null,
      });
      toast({
        title: direction === 'out' ? `Снято ${formatMoney(value)}` : `Цель пополнена на ${formatMoney(value)}`,
        description: updated.completedAt && !goal!.completedAt ? 'Цель достигнута!' : `Накоплено ${formatMoney(updated.currentAmount)} из ${formatMoney(updated.targetAmount)}`,
      });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <ResponsiveDialog open onOpenChange={onOpenChange} title={`Пополнить «${goal.name}»`}>
      {goal.accountId ? (
        <div className="grid gap-4" data-testid="contribution-linked">
          <p className="text-sm">
            Сумма цели считается по остатку счёта{account ? <> «{account.name}»</> : null}. Переведите деньги на этот счёт — прогресс обновится сам.
          </p>
          <div className="flex justify-end gap-2">
            {account && <Button variant="outline" asChild><Link href={`/accounts/${account.id}`}>Открыть счёт</Link></Button>}
            <Button onClick={() => onOpenChange(false)}>Понятно</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate data-testid="contribution-form">
          <ToggleGroup type="single" value={direction} onValueChange={(value) => value && setDirection(value as 'in' | 'out')} className="justify-start">
            <ToggleGroupItem value="in" data-testid="contribution-in">Пополнить</ToggleGroupItem>
            <ToggleGroupItem value="out" data-testid="contribution-out">Снять</ToggleGroupItem>
          </ToggleGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="contribution-amount">Сумма, ₽</Label>
              <Input id="contribution-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5 000" autoFocus data-testid="contribution-amount" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="contribution-date">Дата</Label>
              <Input id="contribution-date" type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contribution-note">Комментарий</Label>
            <Input id="contribution-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Необязательно" />
          </div>
          {error && <p className="text-sm text-destructive" data-testid="contribution-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
            <Button type="submit" disabled={add.isPending} data-testid="contribution-submit">{add.isPending ? 'Сохраняем…' : direction === 'out' ? 'Снять' : 'Пополнить'}</Button>
          </div>
        </form>
      )}
    </ResponsiveDialog>
  );
}

/** История взносов с подгрузкой и удалением. */
export function HistoryDialog({ goal, onOpenChange }: { goal: Goal | null; onOpenChange: (open: boolean) => void }) {
  const history = useContributions(goal?.id ?? null);
  const remove = useDeleteContribution();
  const { toast } = useToast();
  if (!goal) return null;
  const items = history.data?.pages.flatMap((page) => page.items) ?? [];

  async function removeItem(id: string) {
    try {
      await remove.mutateAsync({ goalId: goal!.id, id });
      toast({ title: 'Взнос удалён' });
    } catch (error) {
      toast({ title: 'Не удалось удалить', description: errorMessage(error), variant: 'destructive' });
    }
  }

  return (
    <ResponsiveDialog open onOpenChange={onOpenChange} title={`История «${goal.name}»`}>
      {history.isPending ? (
        <div className="space-y-2" aria-busy="true">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : history.isError ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Не удалось загрузить историю: {errorMessage(history.error)}</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground" data-testid="history-empty">
          {goal.accountId ? 'Цель считается по остатку счёта — взносов вручную нет' : 'Взносов пока нет'}
        </p>
      ) : (
        <ul className="divide-y" data-testid="history-list">
          {items.map((item) => {
            const negative = item.amount.startsWith('-');
            return (
              <li key={item.id} className="flex items-center gap-3 py-2.5" data-testid="history-item">
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{formatDate(item.date)}</div>
                  {item.note && <div className="truncate text-xs text-muted-foreground">{item.note}</div>}
                </div>
                <span className={cn('font-medium tabular-nums', negative ? 'text-destructive' : 'text-success')}>{formatMoney(item.amount, 'RUB', { signed: true })}</span>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => void removeItem(item.id)} disabled={remove.isPending} aria-label="Удалить взнос">
                  <Trash2 className="size-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {history.hasNextPage && (
        <div className="pt-2 text-center">
          <Button variant="ghost" size="sm" onClick={() => history.fetchNextPage()} disabled={history.isFetchingNextPage}>
            {history.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
          </Button>
        </div>
      )}
    </ResponsiveDialog>
  );
}
