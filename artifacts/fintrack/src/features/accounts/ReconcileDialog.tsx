import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { formatMoney, parseMoneyInput, todayIso } from '@workspace/shared/money';
import { useAdjustBalance, type Account } from './api';

/** Сверка: пользователь вводит остаток из приложения банка, разница становится корректировкой (в статистику не входит). */
export function ReconcileDialog({ account, open, onOpenChange }: { account: Account; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const adjust = useAdjustBalance(account.id);
  const [actual, setActual] = useState('');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setActual('');
    setDate(todayIso());
    setError(null);
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const actualBalance = parseMoneyInput(actual);
    if (actualBalance === null) {
      setError('Сумма в формате 12 345,67');
      return;
    }
    if (date > todayIso()) {
      setError('Дата сверки не может быть в будущем');
      return;
    }
    try {
      const { adjustment } = await adjust.mutateAsync({ actualBalance, date });
      toast(adjustment
        ? { title: 'Остаток сверен', description: `Добавлена корректировка ${formatMoney(adjustment.amount, account.currency, { signed: true })}` }
        : { title: 'Остаток совпадает', description: 'Корректировка не нужна' });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Сверить остаток"
      description={`Сейчас в FinTrack: ${formatMoney(account.balance, account.currency)}. Введите остаток из приложения банка — разницу запишем корректировкой, в расходы и доходы она не попадёт.`}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate data-testid="reconcile-form">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="reconcile-amount">Фактический остаток</Label>
            <Input id="reconcile-amount" inputMode="decimal" value={actual} onChange={(e) => setActual(e.target.value)} placeholder="0" autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reconcile-date">На дату</Label>
            <Input id="reconcile-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button type="submit" disabled={adjust.isPending} data-testid="reconcile-submit">{adjust.isPending ? 'Сверяем…' : 'Сверить'}</Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
