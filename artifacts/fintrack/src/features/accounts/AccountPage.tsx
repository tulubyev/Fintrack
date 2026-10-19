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
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import { TransactionFeed } from '@/features/transactions/TransactionFeed';
import { TransactionSheet } from '@/features/transactions/TransactionSheet';
import type { Transaction } from '@/features/transactions/api';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { AccountForm } from './AccountForm';
import { AccountIcon } from './AccountIcon';
import { ReconcileDialog } from './ReconcileDialog';
import { KIND_LABELS, useAccount, useDeleteAccount, useInstitutions, useSetArchived, type Account } from './api';

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
  const [opened, setOpened] = useState<Transaction | null>(null);

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

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Операции</h2>
        <Link href={`/transactions?period=all&account=${data.id}`} className="text-sm font-medium text-primary hover:underline">С фильтрами</Link>
      </div>
      <TransactionFeed
        filters={{ accountId: [data.id] }}
        showAccount={false}
        onOpen={setOpened}
        empty={(
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="account-transactions-empty">
            Операций по счёту пока нет. Загрузите выписку или добавьте операцию вручную.
          </div>
        )}
      />
      <TransactionSheet tx={opened} onClose={() => setOpened(null)} />

      <AccountForm open={editOpen} onOpenChange={setEditOpen} account={data} />
      <ReconcileDialog account={data} open={reconcileOpen} onOpenChange={setReconcileOpen} />
      <DeleteDialog account={data} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  );
}
