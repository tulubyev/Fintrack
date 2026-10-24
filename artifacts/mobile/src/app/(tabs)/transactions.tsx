import { router } from "expo-router";
import { formatDate } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal, useLookup, useRefresh } from "@/data/hooks";
import type { Category, Transaction } from "@/data/types";
import { SyncBanner } from "@/ui/SyncBanner";
import { TransactionRow } from "@/ui/TransactionRow";
import { Button, EmptyState, Page, Section } from "@/ui/kit";

const LIMIT = 200;

/** Лента операций (каркас T6): по дням, из локальной базы. Фильтры, поиск, свайпы и подгрузка — T7. */
export default function Transactions() {
  const refresh = useRefresh();
  const transactions = useLocal(() => store.list<Transaction>("transactions", { limit: LIMIT }), []);
  const categories = useLookup<Category>("categories");

  const days: { date: string; items: Transaction[] }[] = [];
  for (const tx of transactions ?? []) {
    const last = days[days.length - 1];
    if (last?.date === tx.date) last.items.push(tx);
    else days.push({ date: tx.date, items: [tx] });
  }

  return (
    <Page title="Операции" {...refresh}>
      <SyncBanner />
      {transactions?.length === 0 && (
        <EmptyState
          icon="list-outline"
          title="Операций пока нет"
          action={<Button title="Записать трату" icon="add" onPress={() => router.push("/quick-add")} />}
        />
      )}
      {days.map((day) => (
        <Section key={day.date} title={formatDate(day.date)}>
          {day.items.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} category={tx.categoryId ? categories.get(tx.categoryId) : undefined} showDate={false} />
          ))}
        </Section>
      ))}
    </Page>
  );
}
