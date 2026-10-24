import { router } from "expo-router";
import { store } from "@/data/device";
import { useLocal, useRefresh } from "@/data/hooks";
import type { Account } from "@/data/types";
import { EmptyState, ListItem, Money, Page, Section } from "@/ui/kit";

/** Счета (каркас T6): действующие и архив. Добавление и правка счёта — T8. */
export default function Accounts() {
  const refresh = useRefresh();
  const accounts = useLocal(() => store.list<Account>("accounts"), []);
  const active = (accounts ?? []).filter((account) => !account.archivedAt);
  const archived = (accounts ?? []).filter((account) => account.archivedAt);
  const row = (account: Account) => (
    <ListItem
      key={account.id}
      icon={account.kind === "cash" ? "cash-outline" : "card-outline"}
      title={account.name}
      subtitle={account.lastFour ? `•• ${account.lastFour}` : undefined}
      value={<Money amount={account.balance} currency={account.currency} />}
      onPress={() => router.push(`/accounts/${account.id}`)}
      testID={`account-${account.id}`}
    />
  );
  return (
    <Page header={false} {...refresh}>
      {accounts !== undefined && !accounts.length && <EmptyState icon="card-outline" title="Счетов пока нет" text="Добавьте счёт на сайте — он появится после синхронизации." />}
      {active.length > 0 && <Section>{active.map(row)}</Section>}
      {archived.length > 0 && <Section title="Архив">{archived.map(row)}</Section>}
    </Page>
  );
}
