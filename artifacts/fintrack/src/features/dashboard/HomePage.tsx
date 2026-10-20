/**
 * Главный экран (E1.5-T3): «сколько у меня денег», «трачу больше или меньше обычного», «что спишется в ближайшие дни».
 * Десктоп — сетка 12 колонок (график и операции слева, списания, бюджеты и цели справа); телефон — колонка:
 * итоги, списания, траты с категориями, бюджеты и цели, последние операции.
 */
import { useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { track } from '@/lib/analytics';
import { useDashboard } from './api';
import { BlockError, BudgetsBlock, Card, GoalsBlock, RecentBlock, SpendingBlock, StatCards, UpcomingBlock } from './blocks';

const txBucket = (count: number) => (count === 0 ? '0' : count < 30 ? '1-29' : count < 300 ? '30-299' : '300+');

export function HomePage() {
  const { user } = useAuth();
  const summary = useDashboard();
  const isMobile = useIsMobile();
  const viewed = useRef(false);

  useEffect(() => {
    if (!summary.data || viewed.current) return;
    viewed.current = true;
    const { onboarding, freshness, balance } = summary.data;
    track('dashboard_viewed', {
      has_data: onboarding.hasTransactions,
      tx_count_bucket: txBucket(onboarding.txCount),
      accounts: balance.accountsCount,
      stale_accounts: freshness.filter((item) => item.stale).length,
    });
  }, [summary.data]);

  const header = <PageHeader title={user?.firstName ? `Привет, ${user.firstName}!` : 'Главная'} description="Ваши финансы за текущий месяц" />;

  if (summary.isPending) {
    return (
      <>
        {header}
        <div className="space-y-4" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </>
    );
  }
  if (summary.isError) {
    return (
      <>
        {header}
        <Card testId="dashboard-error"><BlockError error={summary.error} onRetry={() => summary.refetch()} /></Card>
        <div className="mt-4"><RecentBlock limit={isMobile ? 5 : 10} /></div>
      </>
    );
  }

  const data = summary.data;
  return (
    <>
      {header}
      <StatCards data={data} />
      <div className="mt-4 grid gap-4 lg:grid-cols-12" data-testid="dashboard-grid">
        <div className="order-2 lg:order-none lg:col-span-8"><SpendingBlock data={data} /></div>
        <div className="order-1 lg:order-none lg:col-span-4"><UpcomingBlock data={data} limit={isMobile ? 3 : undefined} /></div>
        <div className="order-4 lg:order-none lg:col-span-8"><RecentBlock limit={isMobile ? 5 : 10} /></div>
        <div className="order-3 space-y-4 lg:order-none lg:col-span-4">
          <BudgetsBlock data={data} />
          <GoalsBlock data={data} />
        </div>
      </div>
    </>
  );
}
