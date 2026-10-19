import { useState } from 'react';
import { Link } from 'wouter';
import { Banknote, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { AccountForm, type AccountPreset } from './AccountForm';
import { AccountIcon } from './AccountIcon';
import { useAccounts, type Account, type AccountKind } from './api';

const GROUPS: { title: string; kinds: AccountKind[] }[] = [
  { title: 'Карты и счета', kinds: ['debit_card', 'credit_card', 'current', 'digital_ruble', 'other'] },
  { title: 'Наличные', kinds: ['cash'] },
  { title: 'Накопления и вклады', kinds: ['savings', 'deposit'] },
  { title: 'Инвестиции', kinds: ['brokerage', 'iis'] },
  { title: 'Кредиты', kinds: ['loan'] },
];

const QUICK_TILES: { label: string; preset: AccountPreset }[] = [
  { label: 'Карта Сбера', preset: { name: 'Карта Сбера', kind: 'debit_card', institutionCode: 'sber' } },
  { label: 'Карта Т-Банка', preset: { name: 'Карта Т-Банка', kind: 'debit_card', institutionCode: 'tbank' } },
  { label: 'Альфа', preset: { name: 'Карта Альфы', kind: 'debit_card', institutionCode: 'alfa' } },
  { label: 'ВТБ', preset: { name: 'Карта ВТБ', kind: 'debit_card', institutionCode: 'vtb' } },
  { label: 'Наличные', preset: { name: 'Наличные', kind: 'cash', institutionCode: null } },
  { label: 'Другой счёт', preset: {} },
];

function AccountRow({ account }: { account: Account }) {
  const negative = account.balance.startsWith('-');
  return (
    <Link
      href={`/accounts/${account.id}`}
      className={cn('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60', account.archivedAt && 'opacity-60')}
      data-testid="account-row"
    >
      <AccountIcon account={account} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{account.name}</span>
          {account.lastFour && <span className="shrink-0 text-sm text-muted-foreground">•• {account.lastFour}</span>}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {account.archivedAt ? 'В архиве' : account.lastTransactionDate ? `Последняя операция ${formatDate(account.lastTransactionDate)}` : 'Операций нет'}
          {!account.includeInTotal && ' · не в общем балансе'}
        </div>
      </div>
      <div className="text-right">
        <div className={cn('font-semibold tabular-nums', negative && 'text-destructive')}>{formatMoney(account.balance, account.currency)}</div>
        {account.currency !== 'RUB' && account.balanceRub && (
          <div className="text-xs text-muted-foreground tabular-nums">≈ {formatMoney(account.balanceRub, 'RUB')}</div>
        )}
      </div>
    </Link>
  );
}

function Totals({ totals }: { totals: NonNullable<ReturnType<typeof useAccounts>['data']>['totals'] }) {
  const foreign = totals.byCurrency.filter((item) => item.currency !== 'RUB');
  return (
    <section className="mb-6 rounded-xl border bg-card p-4 md:p-6" data-testid="accounts-total">
      <div className="text-sm text-muted-foreground">Всего</div>
      <div className="text-3xl font-semibold tabular-nums">{formatMoney(totals.balanceRub, 'RUB')}</div>
      {foreign.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {totals.byCurrency.map((item) => <span key={item.currency} className="tabular-nums">{formatMoney(item.balance, item.currency)}</span>)}
        </div>
      )}
      {totals.currenciesWithoutRate.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Без курса ЦБ в итог не вошли: {totals.currenciesWithoutRate.join(', ')}. Курсы обновляются ежедневно.
        </p>
      )}
    </section>
  );
}

export function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const accounts = useAccounts(showArchived);
  const [formOpen, setFormOpen] = useState(false);
  const [preset, setPreset] = useState<AccountPreset | undefined>();

  const openForm = (next?: AccountPreset) => {
    setPreset(next);
    setFormOpen(true);
  };

  const actions = (
    <div className="flex gap-2">
      <Button variant="outline" asChild><Link href="/import"><Upload className="mr-2 size-4" />Загрузить выписку</Link></Button>
      <Button onClick={() => openForm()} data-testid="add-account"><Plus className="mr-2 size-4" />Добавить счёт</Button>
    </div>
  );

  let content;
  if (accounts.isPending) {
    content = (
      <div className="divide-y rounded-xl border bg-card" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div>
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>
    );
  } else if (accounts.isError) {
    content = (
      <div className="rounded-xl border bg-card p-6 text-center" data-testid="accounts-error">
        <p className="font-medium">Не удалось загрузить счета</p>
        <p className="mt-1 text-sm text-muted-foreground">{errorMessage(accounts.error)}</p>
        <Button className="mt-4" variant="outline" onClick={() => accounts.refetch()}>Повторить</Button>
      </div>
    );
  } else if (accounts.data.items.length === 0 && !showArchived) {
    content = (
      <div className="rounded-xl border bg-card p-6 md:p-10" data-testid="accounts-empty">
        <div className="mx-auto max-w-md text-center">
          <Banknote className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Добавьте свои счета — это займёт минуту</h2>
          <p className="mt-1 text-sm text-muted-foreground">Укажите текущий остаток, а операции добавите вручную или загрузите выпиской.</p>
        </div>
        <div className="mx-auto mt-6 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-3">
          {QUICK_TILES.map((tile) => (
            <button
              key={tile.label}
              type="button"
              onClick={() => openForm(tile.preset)}
              className="flex items-center gap-3 rounded-lg border p-3 text-left text-sm font-medium transition-colors hover:bg-muted"
            >
              <AccountIcon account={{ kind: tile.preset.kind ?? 'other', institutionCode: tile.preset.institutionCode ?? null }} className="size-8" />
              {tile.label}
            </button>
          ))}
        </div>
      </div>
    );
  } else {
    const groups = GROUPS
      .map((group) => ({ ...group, items: accounts.data.items.filter((item) => group.kinds.includes(item.kind)) }))
      .filter((group) => group.items.length > 0);
    content = (
      <>
        <Totals totals={accounts.data.totals} />
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.title}>
              <h2 className="mb-2 text-sm font-medium text-muted-foreground">{group.title}</h2>
              <div className="divide-y overflow-hidden rounded-xl border bg-card">
                {group.items.map((account) => <AccountRow key={account.id} account={account} />)}
              </div>
            </section>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Счета" actions={actions} />
      {content}
      {!accounts.isPending && !accounts.isError && (accounts.data.items.length > 0 || showArchived) && (
        <Button variant="link" className="mt-4 px-0" onClick={() => setShowArchived((value) => !value)}>
          {showArchived ? 'Скрыть архивные' : 'Показать архивные'}
        </Button>
      )}
      <AccountForm open={formOpen} onOpenChange={setFormOpen} preset={preset} />
    </>
  );
}
