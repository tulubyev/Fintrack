import { useEffect, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAccounts } from '@/features/accounts/api';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney, parseMoneyInput, todayIso } from '@/lib/money';
import { CategorySelect } from './CategorySelect';
import { useDeleteTransaction, useUpdateTransaction, type Transaction, type TransactionPatch } from './api';

const SOURCE_LABELS: Record<string, string> = { manual: 'добавлена вручную', import: 'из выписки', notification: 'из уведомления банка', bank_api: 'из банка', receipt: 'из чека' };

/** Правка операции: панель справа, на телефоне — на весь экран. Сумму, дату и счёт меняют только у ручных расходов и доходов. */
export function TransactionSheet({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const accounts = useAccounts();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');
  const [exclude, setExclude] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tx) return;
    setCategoryId(tx.categoryId);
    setMerchant(tx.merchant ?? '');
    setNote(tx.note ?? '');
    setExclude(tx.excludeFromStats);
    setAmount(tx.amount.replace('-', '').replace('.', ','));
    setDate(tx.date);
    setAccountId(tx.accountId);
    setError(null);
  }, [tx]);

  if (!tx) return null;
  const editableCore = tx.source === 'manual' && (tx.type === 'expense' || tx.type === 'income');
  const categorizable = tx.type === 'expense' || tx.type === 'income';

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!tx) return;
    const patch: TransactionPatch = {};
    if (categorizable && categoryId !== tx.categoryId) patch.categoryId = categoryId;
    if ((merchant.trim() || null) !== tx.merchant) patch.merchant = merchant.trim() || null;
    if ((note.trim() || null) !== tx.note) patch.note = note.trim() || null;
    if (exclude !== tx.excludeFromStats) patch.excludeFromStats = exclude;
    if (editableCore) {
      const parsed = parseMoneyInput(amount, { allowNegative: false });
      if (!parsed || parsed === '0.00') { setError('Сумма в формате 1 234,56'); return; }
      if (parsed !== tx.amount.replace('-', '')) patch.amount = parsed;
      if (date !== tx.date) patch.date = date;
      if (accountId !== tx.accountId) patch.accountId = accountId;
    }
    if (Object.keys(patch).length === 0) { onClose(); return; }
    try {
      await update.mutateAsync({ id: tx.id, patch });
      toast({ title: 'Сохранено' });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function destroy() {
    if (!tx) return;
    try {
      await remove.mutateAsync(tx.id);
      toast({ title: tx.type === 'transfer' ? 'Перевод удалён' : 'Операция удалена', description: tx.type === 'transfer' ? 'Удалены обе части перевода.' : undefined });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Sheet open={Boolean(tx)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className={isMobile ? 'w-full max-w-none overflow-y-auto' : 'w-[420px] overflow-y-auto sm:max-w-[420px]'} data-testid="transaction-sheet">
        <SheetHeader className="mb-4 text-left">
          <SheetTitle className="pr-6">{tx.merchant || tx.description || 'Операция'}</SheetTitle>
          <SheetDescription>
            {formatMoney(tx.amount, tx.currency, { signed: !tx.amount.startsWith('-') })} · {formatDate(tx.date)}{tx.time ? `, ${tx.time}` : ''} · {SOURCE_LABELS[tx.source] ?? tx.source}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={save} className="grid gap-4" noValidate>
          {tx.description && tx.merchant && tx.description !== tx.merchant && <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{tx.description}</p>}

          {categorizable && (
            <div className="grid gap-2">
              <Label>Категория</Label>
              <CategorySelect value={categoryId} onChange={setCategoryId} kind={tx.type === 'income' ? 'income' : 'expense'} testId="tx-category" />
            </div>
          )}

          {editableCore && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="tx-amount">Сумма</Label>
                  <Input id="tx-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tx-date">Дата</Label>
                  <Input id="tx-date" type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Счёт</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {accounts.data?.items.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {tx.type !== 'adjustment' && (
            <div className="grid gap-2">
              <Label htmlFor="tx-merchant">{tx.type === 'transfer' ? 'Название' : 'Получатель или магазин'}</Label>
              <Input id="tx-merchant" value={merchant} maxLength={200} onChange={(e) => setMerchant(e.target.value)} />
            </div>
          )}

          <div className="grid gap-2">
            <Label htmlFor="tx-note">Заметка</Label>
            <Textarea id="tx-note" value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} />
          </div>

          {categorizable && (
            <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <span>
                <span className="block text-sm font-medium">Не учитывать в статистике</span>
                <span className="block text-xs text-muted-foreground">Например, возврат долга или покупка за другого</span>
              </span>
              <Switch checked={exclude} onCheckedChange={setExclude} data-testid="tx-exclude" />
            </label>
          )}

          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

          <div className="flex flex-col gap-2 pt-2">
            <Button type="submit" disabled={update.isPending} data-testid="tx-save">{update.isPending ? 'Сохраняем…' : 'Сохранить'}</Button>
            <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void destroy()} disabled={remove.isPending} data-testid="tx-delete">
              <Trash2 className="mr-2 size-4" />{tx.type === 'transfer' ? 'Удалить перевод' : 'Удалить операцию'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
