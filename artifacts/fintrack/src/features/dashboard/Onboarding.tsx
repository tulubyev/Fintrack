/**
 * Пустое состояние главной и плашки (E1.5-T4): чек-лист из трёх шагов вместо нулей для нового пользователя,
 * баннер «загрузите выписку» при малом числе операций, «Без категории: N» и «данные по счёту устарели».
 */
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, Check, Info, Tags, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccountForm } from '@/features/accounts/AccountForm';
import { useQuickAdd } from '@/features/transactions/QuickAdd';
import { useToast } from '@/hooks/use-toast';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useDismissOnboarding, type DashboardSummary } from './api';
import { clicked } from './blocks';

type Step = 'account' | 'transactions' | 'budget';

const DONE_KEY = 'ft_onboarding_done';
const STARTED_KEY = 'ft_onboarding_started';
const readDone = (): Step[] => {
  try { return JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]'); } catch { return []; }
};
const writeDone = (steps: Step[]) => {
  try { localStorage.setItem(DONE_KEY, JSON.stringify(steps)); } catch { /* приватный режим — событие уйдёт ещё раз, не страшно */ }
};

/** onboarding_step_completed — один раз на шаг в этом браузере, с минутами от регистрации. */
function useStepEvents(onboarding: DashboardSummary['onboarding']) {
  useEffect(() => {
    const done = readDone();
    const now: Record<Step, boolean> = { account: onboarding.hasAccount, transactions: onboarding.hasTransactions, budget: onboarding.hasBudget };
    const fresh = (Object.keys(now) as Step[]).filter((step) => now[step] && !done.includes(step));
    if (!fresh.length) return;
    const minutes = onboarding.signedUpAt ? Math.max(0, Math.round((Date.now() - Date.parse(onboarding.signedUpAt)) / 60_000)) : null;
    for (const step of fresh) track('onboarding_step_completed', { step, minutes_since_signup: minutes });
    writeDone([...done, ...fresh]);
  }, [onboarding]);
}

export const needsOnboarding = (data: DashboardSummary) => !data.onboarding.dismissed && (!data.onboarding.hasAccount || !data.onboarding.hasTransactions);

function StepRow({ n, done, title, children }: { n: number; done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3" data-testid={`onboarding-step-${n}`} data-done={done}>
      <span
        className={cn('flex size-7 shrink-0 items-center justify-center rounded-full border text-sm font-semibold', done ? 'border-success bg-success text-white' : 'border-primary text-primary')}
        aria-hidden
      >
        {done ? <Check className="size-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 pb-1">
        <p className={cn('font-medium', done && 'text-muted-foreground line-through')}>{title}</p>
        {!done && children}
      </div>
    </li>
  );
}

export function Onboarding({ data }: { data: DashboardSummary }) {
  const { onboarding } = data;
  const [accountOpen, setAccountOpen] = useState(false);
  const quickAdd = useQuickAdd();
  const dismiss = useDismissOnboarding();
  const { toast } = useToast();
  useStepEvents(onboarding);
  useEffect(() => {
    // для воронки — один раз на браузер, а не при каждом открытии главной
    try {
      if (localStorage.getItem(STARTED_KEY)) return;
      localStorage.setItem(STARTED_KEY, '1');
    } catch { /* приватный режим — отправим, повтор не страшен */ }
    track('onboarding_started');
  }, []);

  async function hide() {
    try {
      await dismiss.mutateAsync();
    } catch (error) {
      toast({ title: 'Не получилось', description: errorMessage(error), variant: 'destructive' });
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 md:p-8" data-testid="onboarding">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Начнём с ваших реальных трат</h2>
          <p className="mt-1 text-sm text-muted-foreground">Три шага — и здесь появятся баланс, траты месяца и ближайшие списания.</p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground" onClick={() => void hide()} disabled={dismiss.isPending} data-testid="onboarding-dismiss">
          Скрыть
        </Button>
      </div>

      <ol className="mt-6 space-y-4">
        <StepRow n={1} done={onboarding.hasAccount} title="Добавьте счёт или карту">
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setAccountOpen(true)} data-testid="onboarding-add-account">Добавить счёт</Button>
        </StepRow>
        <StepRow n={2} done={onboarding.hasTransactions} title="Загрузите выписку за 3 месяца или добавьте операции вручную">
          <div className="mt-2 flex flex-wrap gap-2">
            <Button asChild size="sm"><Link href="/import"><Upload className="mr-2 size-4" />Загрузить выписку</Link></Button>
            <Button size="sm" variant="outline" onClick={() => quickAdd.open()} disabled={!onboarding.hasAccount} data-testid="onboarding-add-tx">Добавить вручную</Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Рекомендуем выписку: за 3 месяца найдём подписки и предложим бюджеты</p>
        </StepRow>
        <StepRow n={3} done={onboarding.hasBudget} title="Задайте бюджет на главную категорию">
          <Button asChild size="sm" variant="outline" className="mt-2"><Link href="/budgets">Задать бюджет</Link></Button>
        </StepRow>
      </ol>
      <AccountForm open={accountOpen} onOpenChange={setAccountOpen} />
    </section>
  );
}

// ---------- плашки ----------

const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

function Banner({ tone, icon: Icon, children, testId }: { tone: 'info' | 'warning'; icon: typeof Info; children: React.ReactNode; testId: string }) {
  return (
    <div
      className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', tone === 'warning' ? 'border-warning/40 bg-warning/10' : 'border-primary/30 bg-primary/5')}
      data-testid={testId}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', tone === 'warning' ? 'text-warning' : 'text-primary')} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Banners({ data }: { data: DashboardSummary }) {
  useStepEvents(data.onboarding);
  const stale = data.freshness.filter((item) => item.stale && item.lastTransactionDate);
  const few = data.onboarding.hasTransactions && data.onboarding.txCount < 30;
  if (!stale.length && !data.uncategorizedCount && !few) return null;
  return (
    <div className="mt-4 space-y-2" data-testid="banners">
      {stale.map((item) => (
        <Banner key={item.accountId} tone="warning" icon={AlertTriangle} testId="banner-stale">
          Данные по «{item.name}» до {shortDate(item.lastTransactionDate!)} —{' '}
          <Link href={`/import?account=${item.accountId}`} onClick={clicked('stale_banner')} className="font-medium underline underline-offset-2">загрузите свежую выписку</Link>
        </Banner>
      ))}
      {data.uncategorizedCount > 0 && (
        <Banner tone="info" icon={Tags} testId="banner-uncategorized">
          Без категории: {data.uncategorizedCount} —{' '}
          <Link href="/transactions/review" onClick={clicked('uncategorized')} className="font-medium underline underline-offset-2">разобрать</Link>
        </Banner>
      )}
      {few && (
        <Banner tone="info" icon={Upload} testId="banner-few">
          Операций пока {data.onboarding.txCount} —{' '}
          <Link href="/import" className="font-medium underline underline-offset-2">загрузите выписку</Link>, аналитика станет точнее
        </Banner>
      )}
    </div>
  );
}
