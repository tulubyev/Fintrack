import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { parseMoneyInput, todayIso } from '@/lib/money';
import {
  ACCOUNT_KINDS, CURRENCIES, KIND_LABELS, useCreateAccount, useInstitutions, useUpdateAccount,
  type Account, type AccountInput, type AccountKind,
} from './api';

export interface AccountPreset {
  name?: string;
  kind?: AccountKind;
  institutionCode?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Правка существующего счёта; без него — создание (с заготовкой из быстрых плиток). */
  account?: Account;
  preset?: AccountPreset;
  onSaved?: (account: Account) => void;
}

const NO_BANK = 'none';
const CARD_KINDS: AccountKind[] = ['debit_card', 'credit_card', 'current', 'savings', 'deposit', 'loan', 'brokerage', 'iis'];

const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : undefined);

export function AccountForm({ open, onOpenChange, account, preset, onSaved }: Props) {
  const isEdit = Boolean(account);
  const { toast } = useToast();
  const institutions = useInstitutions();
  const create = useCreateAccount();
  const update = useUpdateAccount(account?.id ?? '');
  const saving = create.isPending || update.isPending;

  const [requestId, setRequestId] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('debit_card');
  const [bank, setBank] = useState<string>(NO_BANK);
  const [currency, setCurrency] = useState('RUB');
  const [balance, setBalance] = useState('');
  const [lastFour, setLastFour] = useState('');
  const [includeInTotal, setIncludeInTotal] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Каждое открытие — чистая форма; id запроса один на открытие, чтобы двойной клик не создал два счёта
  useEffect(() => {
    if (!open) return;
    setRequestId(newId());
    setErrors({});
    setName(account?.name ?? preset?.name ?? '');
    setKind(account?.kind ?? preset?.kind ?? 'debit_card');
    setBank(account?.institutionCode ?? preset?.institutionCode ?? NO_BANK);
    setCurrency(account?.currency ?? 'RUB');
    setBalance('');
    setLastFour(account?.lastFour ?? '');
    setIncludeInTotal(account?.includeInTotal ?? true);
  }, [open, account, preset]);

  const showBank = kind !== 'cash';
  const showLastFour = CARD_KINDS.includes(kind);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = 'Введите название';
    const openingBalance = isEdit ? null : balance.trim() === '' ? '0.00' : parseMoneyInput(balance);
    if (!isEdit && openingBalance === null) nextErrors.balance = 'Сумма в формате 12 345,67';
    if (showLastFour && lastFour && !/^\d{4}$/.test(lastFour)) nextErrors.lastFour = 'Ровно 4 цифры';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const fields = {
      name: name.trim(),
      kind,
      institutionCode: showBank && bank !== NO_BANK ? bank : null,
      currency,
      lastFour: showLastFour && lastFour ? lastFour : null,
      includeInTotal,
    };
    try {
      const saved = isEdit
        ? await update.mutateAsync(fields)
        : await create.mutateAsync({ ...fields, id: requestId, openingBalance: openingBalance!, openingBalanceDate: todayIso() } satisfies AccountInput);
      toast({ title: isEdit ? 'Счёт сохранён' : 'Счёт добавлен' });
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      toast({ title: 'Не удалось сохранить', description: errorMessage(error), variant: 'destructive' });
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={isEdit ? 'Изменить счёт' : 'Новый счёт'}>
      <form onSubmit={submit} className="grid gap-4" noValidate data-testid="account-form">
        <div className="grid gap-2">
          <Label htmlFor="account-name">Название</Label>
          <Input id="account-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Например, Зарплатная карта" autoFocus={!isEdit} aria-invalid={Boolean(errors.name)} />
          {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>Вид</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as AccountKind)}>
              <SelectTrigger data-testid="account-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNT_KINDS.map((value) => <SelectItem key={value} value={value}>{KIND_LABELS[value]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Валюта</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger data-testid="account-currency"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {showBank && (
          <div className="grid gap-2">
            <Label>Банк</Label>
            <Select value={bank} onValueChange={setBank}>
              <SelectTrigger data-testid="account-bank"><SelectValue placeholder="Без банка" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BANK}>Без банка</SelectItem>
                {institutions.data?.map((item) => <SelectItem key={item.code} value={item.code}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {!isEdit && (
          <div className="grid gap-2">
            <Label htmlFor="account-balance">Текущий остаток</Label>
            <Input
              id="account-balance"
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0"
              aria-invalid={Boolean(errors.balance)}
              aria-describedby="account-balance-hint"
            />
            <p id="account-balance-hint" className="text-xs text-muted-foreground">
              {kind === 'loan' || kind === 'credit_card' ? 'Долг — со знаком минус, например −120 000. ' : ''}На сегодня; операции до этой даты на остаток не влияют.
            </p>
            {errors.balance && <p className="text-sm text-destructive">{errors.balance}</p>}
          </div>
        )}

        {showLastFour && (
          <div className="grid gap-2">
            <Label htmlFor="account-last-four">Последние 4 цифры карты или счёта</Label>
            <Input
              id="account-last-four"
              inputMode="numeric"
              maxLength={4}
              value={lastFour}
              onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))}
              placeholder="Необязательно"
              className="max-w-40"
              aria-invalid={Boolean(errors.lastFour)}
            />
            {errors.lastFour && <p className="text-sm text-destructive">{errors.lastFour}</p>}
          </div>
        )}

        <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <span>
            <span className="block text-sm font-medium">Учитывать в общем балансе</span>
            <span className="block text-xs text-muted-foreground">Выключите для чужих или служебных счетов</span>
          </span>
          <Switch checked={includeInTotal} onCheckedChange={setIncludeInTotal} />
        </label>

        {isEdit && <p className="text-xs text-muted-foreground">Остаток меняется операциями или кнопкой «Сверить остаток».</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button type="submit" disabled={saving} data-testid="account-submit">{saving ? 'Сохраняем…' : isEdit ? 'Сохранить' : 'Добавить счёт'}</Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}
