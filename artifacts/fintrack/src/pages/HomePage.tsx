import { Link } from 'wouter';
import { SummaryCards } from '@/components/dashboard/SummaryCards';
import { TransactionsList } from '@/components/dashboard/TransactionsList';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/useAuth';

// Главная до E1.5: итоги месяца и последние операции
export function HomePage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader title={user?.firstName ? `Привет, ${user.firstName}!` : 'Главная'} description="Ваши финансы за текущий месяц" />
      <SummaryCards />
      <section className="rounded-xl border bg-card p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Последние операции</h2>
          <Link href="/transactions" className="text-sm font-medium text-primary hover:underline">Все операции</Link>
        </div>
        <TransactionsList />
      </section>
    </>
  );
}
