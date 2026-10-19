import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Archive, ArchiveRestore, ArrowLeft, MoreHorizontal, Pencil, Scale, Trash2, Upload } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { ApiRequestError, errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AccountForm } from './AccountForm';
import { AccountIcon } from './AccountIcon';
import { ReconcileDialog } from './ReconcileDialog';
import {
  KIND_LABELS, useAccount, useAccountTransactions, useAccounts, useDeleteAccount, useInstitutions, useSetArchived,
  type Account, type Transaction,
} from './api';

const TYPE_LABELS: Record<string, string> = { adjustment: 'Корректировка остатка', transfer: 'Перевод' };

function TransactionRow({ tx, accountNames }: { tx: Transaction; accountNames: Map<string, string> }) {
  const negative = tx.amount.startsWith('-');
  const counterpart = tx.transferCounterpartAccountId ? accountNames.get(tx.transferCounterpartAccountId) : undefined;
  const title = tx.merchant || tx.description || TYPE_LABELS[tx.type] || 'Операция';
  const subtitle = tx.type === 'transfer'
    ? `Перевод ${negative ? 'на' : 'с'} ${counterpart ?? 'другой счёт'}`
    : tx.type === 'adjustment' ? 'Не входит в статистику' : tx.note ?? '';
  return (
    <div className="flex items-center gap-3 px-4 py-3" data-testid="account-transaction">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      <div className={cn('font-medium tabular-nums', tx.type === 'transfer' || tx.type === 'adjustment' ? 'text-muted-foreground' : negative ? 'text-destructive' : 'text-[hsl(142,71%,35%)]')}>
        {formatMoney(tx.amount, tx.currency, { signed: true })}
      </div>
    </div>
  );
}

function Transactions({ account }: { account: Account }) {
  const transactions = useAccountTransactions(account.id);
  const accounts = useAccounts(true);
  const accountNames = new Map(accounts.data?.items.map((item) => [item.id, item.name]));

  if (transactions.isPending) return <Skeleton className="h-40 rounded-xl" />;
  if (transactions.isError) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm">
        Не удалось загрузить операции. <Button variant="link" className="px-1" onClick={() => transactions.refetch()}>Повторить</Button>
      </div>
    );
  }
  const items = transactions.data.items;
  if (items.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="account-transactions-empty">
        Операций по счёту пока нет. Загрузите выписку или добавьте операцию вручную.
      </div>
    );
  }

  // Лента по дням; полный экран операций с фильтрами — E1.1-T7
  const days = new Map<string, Transaction[]>();
  for (const tx of items) days.set(tx.date, [...(days.get(tx.date) ?? []), tx]);
  return (
    <div className="space-y-4">
      {[...days].map(([date, dayItems]) => (
        <section key={date}>
          <h3 className="mb-1 text-sm font-medium text-muted-foreground">{formatDate(date)}</h3>
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {dayItems.map((tx) => <TransactionRow key={tx.id} tx={tx} accountNames={accountNames} />)}
          </div>
        </section>
      ))}
      {transactions.data.nextCursor && (
        <p className="text-center text-sm text-muted-foreground">Показаны последние 50 операций. Полная лента — в разделе «Операции».</p>
      )}
    </div>
  );
}

function DeleteDialog({ account, open, onOpenChange }: { account: Account; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const remove = useDeleteAccount(account.id);
  const [withTransactions, setWithTransactions] = useState(false);
  const hasTransactions = Boolean(account.lastTransactionDate);

  async function confirm() {
    try {
      await remove.mutateAsync(withTransactions);
      toast({ title: 'Счёт удалён' });
      navigate('/accounts', { replace: true });
    } catch (error) {
      const needsConfirm = error instanceof ApiRequestError && error.status === 409;
      toast({ title: 'Счёт не удалён', description: needsConfirm ? 'На счёте есть операции: отметьте «Удалить вместе с операциями» или отправьте счёт в архив.' : errorMessage(error), variant: 'destructive' });
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить «{account.name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            {hasTransactions
              ? 'Если счёт больше не нужен, но история пригодится, отправьте его в архив. Удаление можно сделать только вместе с операциями.'
              : 'Счёт исчезнет из списка и итогов.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasTransactions && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={withTransactions} onCheckedChange={(value) => setWithTransactions(value === true)} />
            Удалить вместе с операциями (переводы удалятся и во втором счёте)
          </label>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => { event.preventDefault(); void confirm(); }}
            disabled={remove.isPending || (hasTransactions && !withTransactions)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AccountPage({ id }: { id: string }) {
  const account = useAccount(id);
  const institutions = useInstitutions();
  const archive = useSetArchived(id);
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (account.isPending) {
    return <div className="space-y-4" aria-busy="true"><Skeleton className="h-8 w-56" /><Skeleton className="h-32 rounded-xl" /><Skeleton className="h-60 rounded-xl" /></div>;
  }
  if (account.isError) {
    if (account.error instanceof ApiRequestError && account.error.status === 404) return <NotFoundPage />;
    return (
      <div className="rounded-xl border bg-card p-6 text-center">
        <p className="font-medium">Не удалось загрузить счёт</p>
        <Button className="mt-4" variant="outline" onClick={() => account.refetch()}>Повторить</Button>
      </div>
    );
  }

  const data = account.data;
  const archived = Boolean(data.archivedAt);
  const bankName = institutions.data?.find((item) => item.code === data.institutionCode)?.name;

  async function toggleArchive() {
    try {
      await archive.mutateAsync(!archived);
      toast({ title: archived ? 'Счёт возвращён из архива' : 'Счёт в архиве', description: archived ? undefined : 'Он не входит в итоги, история операций сохранена.' });
    } catch (error) {
      toast({ title: 'Не получилось', description: errorMessage(error), variant: 'destructive' });
    }
  }

  return (
    <>
      <Link href="/accounts" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />Счета
      </Link>
      <PageHeader title={data.name} />

      <section className="mb-6 rounded-xl border bg-card p-4 md:p-6" data-testid="account-card">
        <div className="flex items-start gap-4">
          <AccountIcon account={data} className="size-12" />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-muted-foreground">
              {[KIND_LABELS[data.kind], bankName, data.lastFour && `•• ${data.lastFour}`].filter(Boolean).join(' · ')}
              {archived && ' · в архиве'}
            </div>
            <div className={cn('mt-1 text-3xl font-semibold tabular-nums', data.balance.startsWith('-') && 'text-destructive')} data-testid="account-balance">
              {formatMoney(data.balance, data.currency)}
            </div>
            {data.currency !== 'RUB' && data.balanceRub && <div className="text-sm text-muted-foreground">≈ {formatMoney(data.balanceRub, 'RUB')} по курсу ЦБ</div>}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => setReconcileOpen(true)} disabled={archived} data-testid="reconcile">
            <Scale className="mr-2 size-4" />Сверить остаток
          </Button>
          <Button variant="outline" asChild>
            <Link href={`/import?accountId=${data.id}`}><Upload className="mr-2 size-4" />Загрузить выписку</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Ещё действия" data-testid="account-actions"><MoreHorizontal className="size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}><Pencil className="mr-2 size-4" />Изменить</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void toggleArchive()} data-testid="toggle-archive">
                {archived ? <><ArchiveRestore className="mr-2 size-4" />Вернуть из архива</> : <><Archive className="mr-2 size-4" />Архивировать</>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDeleteOpen(true)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 size-4" />Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </section>

      <h2 className="mb-3 text-lg font-semibold">Операции</h2>
      <Transactions account={data} />

      <AccountForm open={editOpen} onOpenChange={setEditOpen} account={data} />
      <ReconcileDialog account={data} open={reconcileOpen} onOpenChange={setReconcileOpen} />
      <DeleteDialog account={data} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
