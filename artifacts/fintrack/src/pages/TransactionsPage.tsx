import { TransactionsList } from '@/components/dashboard/TransactionsList';
import { PageHeader } from '@/components/layout/PageHeader';

// Лента с фильтрами и формой операции — E1.1-T7; пока список последних операций
export function TransactionsPage() {
  return (
    <>
      <PageHeader title="Операции" />
      <section className="rounded-xl border bg-card p-4 md:p-6">
        <TransactionsList />
      </section>
    </>
  );
}
