import { router } from "expo-router";
import { fromKopecks, toKopecks } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal, useRefresh } from "@/data/hooks";
import type { Account } from "@/data/types";
import { kindIcon } from "@/lib/accounts";
import { Badge, Button, Card, EmptyState, Label, ListItem, Money, Page, Section } from "@/ui/kit";

/** Счета (E2.1-T8): итог по счетам «в балансе», действующие и архив; добавление — /accounts/new. */
export default function Accounts() {
  const refresh = useRefresh();
  const accounts = useLocal(() => store.list<Account>("accounts"), []);
  const active = (accounts ?? []).filter((account) => !account.archivedAt);
  const archived = (accounts ?? []).filter((account) => account.archivedAt);
  const total = fromKopecks(active.filter((account) => account.includeInTotal).reduce((sum, account) => sum + toKopecks(account.balanceRub ?? "0"), 0n));
  const row = (account: Account) => (
    <ListItem
      key={account.id}
      icon={kindIcon(account.kind)}
      title={account.name}
      subtitle={[account.lastFour ? `•• ${account.lastFour}` : null, account.includeInTotal ? null : "не в балансе"].filter(Boolean).join(" · ") || undefined}
      value={<Money amount={account.balance} currency={account.currency} />}
      right={account.archivedAt ? <Badge text="архив" /> : undefined}
      onPress={() => router.push(`/accounts/${account.id}`)}
      testID={`account-${account.id}`}
    />
  );
  return (
    <Page header={false} {...refresh}>
      {accounts !== undefined && !accounts.length ? (
        <EmptyState icon="card-outline" title="Счетов пока нет" text="Добавьте карту или наличные — и записывайте траты." action={<Button title="Добавить счёт" icon="add" onPress={() => router.push("/accounts/new")} />} />
      ) : (
        <>
          <Card>
            <Label variant="caption" tone="muted">Всего на счетах</Label>
            <Money amount={total} size="title" testID="accounts-total" />
          </Card>
          {active.length > 0 && <Section>{active.map(row)}</Section>}
          <Button title="Добавить счёт" variant="secondary" icon="add" onPress={() => router.push("/accounts/new")} testID="account-add" />
          {archived.length > 0 && <Section title="Архив">{archived.map(row)}</Section>}
        </>
      )}
    </Page>
  );
}
