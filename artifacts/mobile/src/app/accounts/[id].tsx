import { useLocalSearchParams } from "expo-router";
import { store } from "@/data/device";
import { useLocal, useLookup } from "@/data/hooks";
import type { Account, Category, Transaction } from "@/data/types";
import { TransactionRow } from "@/ui/TransactionRow";
import { Card, EmptyState, Label, Money, Page, Section } from "@/ui/kit";

/** Счёт (каркас T6): остаток и последние операции по счёту. */
export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const account = useLocal(() => store.get<Account>("accounts", id), [id]);
  const transactions = useLocal(() => store.list<Transaction>("transactions", { accountId: id, limit: 50 }), [id]);
  const categories = useLookup<Category>("categories");

  if (account === undefined) return null;
  if (account === null) return <Page header={false}><EmptyState icon="search-outline" title="Счёт не найден" /></Page>;

  return (
    <Page header={false}>
      <Card>
        <Label variant="heading">{account.name}</Label>
        <Money amount={account.balance} currency={account.currency} size="title" />
        {account.archivedAt && <Label variant="caption" tone="muted">В архиве</Label>}
      </Card>
      {transactions?.length ? (
        <Section title="Операции">
          {transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} category={tx.categoryId ? categories.get(tx.categoryId) : undefined} />)}
        </Section>
      ) : (
        transactions && <EmptyState icon="receipt-outline" title="Операций по счёту нет" />
      )}
    </Page>
  );
}
