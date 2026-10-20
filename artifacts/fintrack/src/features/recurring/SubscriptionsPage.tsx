/**
 * Экран «Подписки и регулярные платежи» (E1.6-T4): итоги в месяц и в год, новые серии на подтверждение,
 * вкладки «Подписки» · «Обязательные» · «Доходы» · «Отменённые и прошлые», пересечения сервисов, карточка серии.
 */
import { useState, type ComponentType } from 'react';
import { Link, useSearch } from 'wouter';
import { Briefcase, CalendarClock, Check, HandCoins, Hourglass, KeyRound, Landmark, Repeat, RefreshCw, Upload, X, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/PageHeader';
import { useTransactionFeed } from '@/features/transactions/api';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { formatMoney, todayIso } from '@/lib/money';
import { cn } from '@/lib/utils';
import {
  daysUntil, MANDATORY_KINDS, paymentsWord, scheduleText, useDetect, useRecurring, whenText,
  type Overlap, type RecurringSeries, type SeriesKind,
} from './api';
import { SeriesSheet, useSeriesStatus } from './SeriesSheet';

const KIND_ICONS: Record<SeriesKind, ComponentType<{ className?: string }>> = {
  subscription: Repeat,
  utility: Zap,
  loan: Landmark,
  rent: KeyRound,
  salary: Briefcase,
  pension: HandCoins,
  trial: Hourglass,
  other: CalendarClock,
};

type Tab = 'subscriptions' | 'mandatory' | 'income' | 'past';
const TABS: { value: Tab; label: string; empty: string }[] = [
  { value: 'subscriptions', label: 'Подписки', empty: 'Подписок не нашли' },
  { value: 'mandatory', label: 'Обязательные', empty: 'ЖКУ, связь, кредиты и аренда появятся здесь, когда найдём их в операциях' },
  { value: 'income', label: 'Доходы', empty: 'Регулярных поступлений — зарплаты, пенсии — пока не нашли' },
  { value: 'past', label: 'Отменённые и прошлые', empty: 'Отменённых подписок нет' },
];

const isActive = (series: RecurringSeries) => series.status === 'detected' || series.status === 'confirmed';

function tabOf(series: RecurringSeries): Tab {
  if (!isActive(series)) return 'past';
  if (series.direction === 'in') return 'income';
  return MANDATORY_KINDS.includes(series.kind) ? 'mandatory' : 'subscriptions';
}

/** «Дублирует Okko», «Уже входит в Яндекс Плюс», «Включает Кинопоиск»: серия может попасть в несколько пересечений. */
function overlapText(series: RecurringSeries, overlaps: Overlap[], names: Map<string, string>): string | null {
  const texts = overlaps.filter((overlap) => overlap.seriesIds.includes(series.id)).map((overlap) => {
    const others = overlap.seriesIds.filter((id) => id !== series.id).map((id) => names.get(id)).filter(Boolean);
    if (overlap.group !== 'yandex_plus') return `Дублирует ${others.join(', ')}`;
    return overlap.seriesIds[0] === series.id ? `Включает ${others.join(', ')}` : `Уже входит в ${names.get(overlap.seriesIds[0])}`;
  });
  return texts.length ? texts.join(' · ') : null;
}

function SeriesIcon({ series }: { series: RecurringSeries }) {
  const Icon = KIND_ICONS[series.kind];
  return (
    <span
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full',
        series.direction === 'in' ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary',
      )}
      aria-hidden
    >
      <Icon className="size-5" />
    </span>
  );
}

function SeriesRow({ series, overlap, today, onOpen }: { series: RecurringSeries; overlap: string | null; today: string; onOpen: () => void }) {
  const days = series.nextExpectedDate && isActive(series) ? daysUntil(series.nextExpectedDate, today) : null;
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60" data-testid="series-row">
        <SeriesIcon series={series} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{series.displayName}</span>
            {series.status === 'detected' && <Badge className="h-5 px-1.5 text-[11px]" data-testid="badge-new">Новая</Badge>}
            {series.kind === 'trial' && <Badge variant="outline" className="h-5 px-1.5 text-[11px]">Пробный период</Badge>}
          </div>
          <p className="truncate text-sm text-muted-foreground">
            {series.status === 'cancelled' ? 'Отменена' : series.status === 'ended' ? 'Списания прекратились' : scheduleText(series)}
          </p>
          {overlap && <p className="text-xs text-warning" data-testid="overlap">{overlap}</p>}
          {series.priceChange && isActive(series) && (
            <p className="text-xs text-warning">Цена изменилась: {formatMoney(series.priceChange.from, series.currency)} → {formatMoney(series.priceChange.to, series.currency)}</p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className={cn('font-medium tabular-nums', series.direction === 'in' && 'text-success')}>
            {formatMoney(series.expectedAmount ?? series.amountLast, series.currency, { signed: series.direction === 'in' })}
          </p>
          {days !== null && <p className={cn('text-xs', days >= 0 && days <= 3 ? 'text-foreground' : 'text-muted-foreground')}>{whenText(days)}</p>}
        </div>
      </button>
    </li>
  );
}

/** «Мы нашли 3 регулярных платежа — это правда подписки?» с «Да» и «Нет» на каждом. */
function NewSeriesBlock({ items, onOpen }: { items: RecurringSeries[]; onOpen: (id: string) => void }) {
  const status = useSeriesStatus();
  if (!items.length) return null;
  const allIncome = items.every((item) => item.direction === 'in');
  return (
    <section className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4" data-testid="new-series">
      <h2 className="font-semibold">Мы нашли {items.length} {paymentsWord(items.length)} — {allIncome ? 'всё верно?' : 'это правда подписки?'}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">Подтвердите — будем напоминать о списаниях и считать их в итогах</p>
      <ul className="mt-3 space-y-2">
        {items.map((series) => (
          <li key={series.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-background p-2 pl-3" data-testid="new-series-row">
            {/* на телефоне кнопки уходят под название, чтобы оно не обрезалось */}
            <button type="button" className="min-w-[12rem] flex-1 text-left" onClick={() => onOpen(series.id)}>
              <span className="block truncate font-medium">{series.displayName}</span>
              <span className="block truncate text-sm text-muted-foreground">
                {formatMoney(series.expectedAmount ?? series.amountLast, series.currency)} · {scheduleText(series)}
              </span>
            </button>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => void status.set(series, 'confirmed')} disabled={status.isPending} data-testid="new-series-yes">
                <Check className="mr-1 size-4" />Да
              </Button>
              <Button size="sm" variant="outline" onClick={() => void status.set(series, 'ignored')} disabled={status.isPending} data-testid="new-series-no">
                <X className="mr-1 size-4" />Нет
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Пусто: мало истории — просим выписку за 3 месяца; история есть — предлагаем отметить вручную. */
function EmptyState() {
  const old = useTransactionFeed({ to: addDaysIso(todayIso(), -60) }, 1);
  if (old.isPending) return <Skeleton className="h-40 rounded-xl" />;
  const hasHistory = old.isSuccess && old.data.pages[0].items.length > 0;
  return (
    <div className="rounded-xl border bg-card p-6 text-center md:p-10" data-testid={hasHistory ? 'recurring-empty-history' : 'recurring-empty-new'}>
      <Repeat className="mx-auto size-10 text-muted-foreground" aria-hidden />
      {hasHistory ? (
        <>
          <h2 className="mt-3 text-lg font-semibold">Регулярных платежей не нашли</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Если мы что-то пропустили — отметьте операции вручную: выберите два и больше списаний одного платежа.</p>
          <Button asChild variant="outline" className="mt-4"><Link href="/transactions?select=1&period=all">Отметить операции</Link></Button>
        </>
      ) : (
        <>
          <h2 className="mt-3 text-lg font-semibold">Найдём подписки и регулярные платежи</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Загрузите выписку минимум за 3 месяца — так мы найдём подписки и регулярные платежи.</p>
          <Button asChild className="mt-4"><Link href="/import"><Upload className="mr-2 size-4" />Загрузить выписку</Link></Button>
        </>
      )}
    </div>
  );
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function SubscriptionsPage() {
  const list = useRecurring();
  const detect = useDetect();
  const { toast } = useToast();
  const search = useSearch();
  const [tab, setTab] = useState<Tab>('subscriptions');
  const [openId, setOpenId] = useState<string | null>(() => new URLSearchParams(search).get('open'));
  const today = todayIso();

  async function runDetect() {
    try {
      await detect.mutateAsync();
      toast({ title: 'Ищем регулярные платежи', description: 'Обновим список через несколько секунд' });
    } catch (error) {
      toast({ title: 'Не получилось', description: errorMessage(error), variant: 'destructive' });
    }
  }

  let content;
  if (list.isPending) {
    content = <div className="space-y-3" aria-busy="true"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-64 rounded-xl" /></div>;
  } else if (list.isError) {
    content = (
      <div className="rounded-xl border bg-card p-6 text-center" data-testid="recurring-error">
        <p className="font-medium">Не удалось загрузить регулярные платежи</p>
        <p className="mt-1 text-sm text-muted-foreground">{errorMessage(list.error)}</p>
        <Button className="mt-4" variant="outline" onClick={() => list.refetch()}>Повторить</Button>
      </div>
    );
  } else if (list.data.items.length === 0) {
    content = <EmptyState />;
  } else {
    const { items, totals, overlaps } = list.data;
    const names = new Map(items.map((item) => [item.id, item.displayName]));
    const byTab = (value: Tab) => items.filter((item) => tabOf(item) === value);
    content = (
      <>
        <div className="mb-6 grid gap-3 sm:grid-cols-2" data-testid="recurring-totals">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Подписки{totals.count ? ` · ${totals.count}` : ''}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(totals.monthly)} <span className="text-sm font-normal text-muted-foreground">в месяц</span></p>
            <p className="text-sm tabular-nums text-muted-foreground">{formatMoney(totals.yearly)} в год</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">Обязательные платежи</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{formatMoney(totals.mandatoryMonthly)} <span className="text-sm font-normal text-muted-foreground">в месяц</span></p>
            {totals.incomeMonthly !== '0.00' && <p className="text-sm tabular-nums text-muted-foreground">Регулярные доходы — {formatMoney(totals.incomeMonthly)} в месяц</p>}
          </div>
        </div>

        <NewSeriesBlock items={items.filter((item) => item.status === 'detected')} onOpen={setOpenId} />

        <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
            <TabsList className="w-max md:w-auto">
              {TABS.map((item) => (
                <TabsTrigger key={item.value} value={item.value} data-testid={`tab-${item.value}`}>
                  {item.label}
                  <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{byTab(item.value).length}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {TABS.map((item) => {
            const rows = byTab(item.value);
            return (
              <TabsContent key={item.value} value={item.value} className="mt-4">
                {rows.length === 0 ? (
                  <p className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">{item.empty}</p>
                ) : (
                  <ul className="divide-y overflow-hidden rounded-xl border bg-card" data-testid={`list-${item.value}`}>
                    {rows.map((series) => (
                      <SeriesRow key={series.id} series={series} overlap={overlapText(series, overlaps, names)} today={today} onOpen={() => setOpenId(series.id)} />
                    ))}
                  </ul>
                )}
              </TabsContent>
            );
          })}
        </Tabs>

        <p className="mt-6 text-sm text-muted-foreground">
          Что-то пропустили? <Link href="/transactions?select=1&period=all" className="underline underline-offset-2">Отметьте операции</Link> — выберите два и больше списаний и нажмите «Регулярный платёж».
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Подписки и регулярные платежи"
        actions={(
          <Button variant="outline" onClick={() => void runDetect()} disabled={detect.isPending} data-testid="recurring-detect">
            <RefreshCw className={cn('mr-2 size-4', detect.isPending && 'animate-spin')} />Найти заново
          </Button>
        )}
      />
      {content}
      <SeriesSheet seriesId={openId} onClose={() => setOpenId(null)} />
    </>
  );
}
