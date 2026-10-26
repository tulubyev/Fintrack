/**
 * Экран целей (E1.4-T6): карточки с прогрессом, нужным взносом к сроку и прогнозом при текущем темпе,
 * пополнение и история, достижение (конфетти один раз, «В архив»), архив и удаление.
 */
import { useState } from 'react';
import { Archive, ArchiveRestore, History, MoreHorizontal, Pencil, Plus, Target, Trash2, Wallet } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAccounts } from '@/features/accounts/api';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney, toKopecks } from '@workspace/shared/money';
import { cn } from '@/lib/utils';
import { monthDative, useArchiveGoal, useDeleteGoal, useGoals, type Goal } from './api';
import { ContributionDialog, HistoryDialog } from './ContributionDialogs';
import { GoalForm, type GoalPreset } from './GoalForm';
import { Confetti, GoalIcon, useCelebrateOnce } from './GoalVisuals';

const PRESETS: { label: string; preset: GoalPreset }[] = [
  { label: 'Отпуск', preset: { name: 'Отпуск', icon: 'plane' } },
  { label: 'Подушка безопасности', preset: { name: 'Подушка безопасности', icon: 'shield' } },
  { label: 'Машина', preset: { name: 'Машина', icon: 'car' } },
  { label: 'Своя цель', preset: {} },
];

/** Строки о темпе: сколько откладывать к сроку и когда цель будет достигнута при текущем темпе. */
function Pace({ goal }: { goal: Goal }) {
  const noProgress = toKopecks(goal.currentAmount) === 0n && toKopecks(goal.avgMonthlyGrowth) <= 0n;
  return (
    <div className="space-y-1 text-sm" data-testid="goal-pace">
      {goal.monthlyNeeded && goal.targetDate && (
        <p>Откладывайте <span className="font-medium tabular-nums">{formatMoney(goal.monthlyNeeded)}/мес</span>, чтобы успеть к {formatDate(goal.targetDate)}</p>
      )}
      {noProgress && !goal.accountId ? (
        <p className="text-muted-foreground">Сделайте первый взнос — посчитаем прогноз</p>
      ) : goal.forecastDate ? (
        <p className={cn(goal.onTrack === false ? 'text-warning' : 'text-muted-foreground')} data-testid="goal-forecast">
          При текущем темпе: к {monthDative(goal.forecastDate)}{goal.onTrack === false && ' — позже срока'}
        </p>
      ) : (
        <p className="text-warning" data-testid="goal-forecast">При текущем темпе цель не будет достигнута</p>
      )}
    </div>
  );
}

interface CardActions {
  onContribute: (goal: Goal) => void;
  onHistory: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
}

function GoalCard({ goal, accountName, actions }: { goal: Goal; accountName?: string; actions: CardActions }) {
  const archive = useArchiveGoal();
  const { toast } = useToast();
  const celebrate = useCelebrateOnce(goal);
  const done = Boolean(goal.completedAt);

  async function setArchived(archived: boolean) {
    try {
      await archive.mutateAsync({ id: goal.id, archived });
      toast({ title: archived ? 'Цель в архиве' : 'Цель возвращена из архива' });
    } catch (error) {
      toast({ title: 'Не получилось', description: errorMessage(error), variant: 'destructive' });
    }
  }

  return (
    <article className={cn('relative flex flex-col rounded-xl border bg-card p-4 md:p-5', goal.archivedAt && 'opacity-70')} data-testid="goal-card" data-done={done}>
      {celebrate && <Confetti />}
      <div className="flex items-start gap-3">
        <GoalIcon goal={goal} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">{goal.name}</h3>
            {done && <Badge className="bg-success text-primary-foreground hover:bg-success" data-testid="goal-done">Достигнута</Badge>}
            {goal.archivedAt && <Badge variant="secondary">В архиве</Badge>}
          </div>
          <p className="mt-0.5 tabular-nums">
            <span className="font-semibold">{formatMoney(goal.currentAmount)}</span>
            <span className="text-muted-foreground"> из {formatMoney(goal.targetAmount)} ({goal.percent}%)</span>
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Действия с целью" data-testid="goal-menu"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => actions.onEdit(goal)}><Pencil className="mr-2 size-4" />Изменить</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onHistory(goal)}><History className="mr-2 size-4" />История</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void setArchived(!goal.archivedAt)} data-testid="goal-toggle-archive">
              {goal.archivedAt ? <><ArchiveRestore className="mr-2 size-4" />Вернуть из архива</> : <><Archive className="mr-2 size-4" />В архив</>}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onDelete(goal)} className="text-destructive focus:text-destructive" data-testid="goal-delete">
              <Trash2 className="mr-2 size-4" />Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div
        className="mt-3 h-2 rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(goal.percent, 100)}
        aria-label={`Накоплено ${goal.percent}%`}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500', done ? 'bg-success' : 'bg-primary')} style={{ width: `${Math.min(goal.percent, 100)}%` }} />
      </div>

      <div className="mt-3 flex-1 space-y-1">
        {done ? (
          <p className="text-sm text-success">Цель достигнута — можно отправить её в архив или поставить новую</p>
        ) : (
          <Pace goal={goal} />
        )}
        {goal.accountId && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Wallet className="size-3.5" aria-hidden />
            По остатку счёта{accountName ? ` «${accountName}»` : ''}{goal.countOnlyNewMoney ? ', только новые деньги' : ''}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {done && !goal.archivedAt ? (
          <Button onClick={() => void setArchived(true)} disabled={archive.isPending} data-testid="goal-archive-done"><Archive className="mr-2 size-4" />В архив</Button>
        ) : !goal.archivedAt && (
          <Button onClick={() => actions.onContribute(goal)} data-testid="goal-contribute"><Plus className="mr-2 size-4" />Пополнить</Button>
        )}
        <Button variant="outline" onClick={() => actions.onHistory(goal)} data-testid="goal-history"><History className="mr-2 size-4" />История</Button>
      </div>
    </article>
  );
}

export function GoalsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const goals = useGoals(showArchived);
  const accounts = useAccounts(true);
  const remove = useDeleteGoal();
  const { toast } = useToast();
  const [form, setForm] = useState<{ open: boolean; goal?: Goal; preset?: GoalPreset }>({ open: false });
  const [contributeTo, setContributeTo] = useState<Goal | null>(null);
  const [historyOf, setHistoryOf] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);

  const accountNames = new Map(accounts.data?.items.map((item) => [item.id, item.name]));
  const actions: CardActions = {
    onContribute: setContributeTo,
    onHistory: setHistoryOf,
    onEdit: (goal) => setForm({ open: true, goal }),
    onDelete: setDeleting,
  };

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      toast({ title: 'Цель удалена' });
      setDeleting(null);
    } catch (error) {
      toast({ title: 'Не удалось удалить', description: errorMessage(error), variant: 'destructive' });
    }
  }

  let content;
  if (goals.isPending) {
    content = <div className="grid gap-4 md:grid-cols-2" aria-busy="true">{Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}</div>;
  } else if (goals.isError) {
    content = (
      <div className="rounded-xl border bg-card p-6 text-center" data-testid="goals-error">
        <p className="font-medium">Не удалось загрузить цели</p>
        <p className="mt-1 text-sm text-muted-foreground">{errorMessage(goals.error)}</p>
        <Button className="mt-4" variant="outline" onClick={() => goals.refetch()}>Повторить</Button>
      </div>
    );
  } else if (goals.data.items.length === 0 && !showArchived) {
    content = (
      <div className="rounded-xl border bg-card p-6 md:p-10" data-testid="goals-empty">
        <div className="mx-auto max-w-md text-center">
          <Target className="mx-auto size-10 text-muted-foreground" aria-hidden />
          <h2 className="mt-3 text-lg font-semibold">Копите на что-то конкретное?</h2>
          <p className="mt-1 text-sm text-muted-foreground">Создайте цель — посчитаем, сколько откладывать и когда вы её достигнете.</p>
        </div>
        <div className="mx-auto mt-6 grid max-w-lg grid-cols-2 gap-3">
          {PRESETS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setForm({ open: true, preset: item.preset })}
              className="rounded-lg border p-3 text-left text-sm font-medium transition-colors hover:bg-muted"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    );
  } else {
    content = goals.data.items.length === 0
      ? <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Целей нет, в архиве тоже пусто</p>
      : (
        <div className="grid gap-4 md:grid-cols-2" data-testid="goal-list">
          {goals.data.items.map((goal) => (
            <GoalCard key={goal.id} goal={goal} accountName={goal.accountId ? accountNames.get(goal.accountId) : undefined} actions={actions} />
          ))}
        </div>
      );
  }

  return (
    <>
      <PageHeader
        title="Цели"
        actions={<Button onClick={() => setForm({ open: true })} data-testid="add-goal"><Plus className="mr-2 size-4" />Новая цель</Button>}
      />
      {content}
      {(goals.data?.items.length || showArchived) ? (
        <label className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showArchived} onCheckedChange={setShowArchived} data-testid="goals-show-archived" />
          Показывать архив
        </label>
      ) : null}

      <GoalForm open={form.open} onOpenChange={(open) => setForm((current) => ({ ...current, open }))} goal={form.goal} preset={form.preset} />
      <ContributionDialog goal={contributeTo} onOpenChange={(open) => !open && setContributeTo(null)} />
      <HistoryDialog goal={historyOf} onOpenChange={(open) => !open && setHistoryOf(null)} />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить цель «{deleting?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>История взносов удалится вместе с целью. Если цель просто достигнута или неактуальна — лучше отправить её в архив.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => { event.preventDefault(); void confirmDelete(); }}
              disabled={remove.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="goal-delete-confirm"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
