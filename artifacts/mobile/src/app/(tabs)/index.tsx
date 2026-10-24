import { router } from "expo-router";
import { fromKopecks, toKopecks } from "@workspace/shared/money";
import { useAuth } from "@/auth/useAuth";
import { store } from "@/data/device";
import { useLocal, useLookup, useRefresh, useSyncState } from "@/data/hooks";
import type { Account, Category, Transaction } from "@/data/types";
import { SyncBanner } from "@/ui/SyncBanner";
import { TransactionRow } from "@/ui/TransactionRow";
import { Button, Card, EmptyState, Label, Money, Page, Section } from "@/ui/kit";

/** Главная (каркас T6): баланс по счетам, последние операции. Полная главная с бюджетами и целями — T7. */
export default function Home() {
  const { user } = useAuth();
  const refresh = useRefresh();
  const syncState = useSyncState();
  const accounts = useLocal(() => store.list<Account>("accounts"), []);
  const recent = useLocal(() => store.list<Transaction>("transactions", { limit: 5 }), []);
  const categories = useLookup<Category>("categories");

  const active = (accounts ?? []).filter((account) => !account.archivedAt && account.includeInTotal);
  const total = fromKopecks(active.reduce((sum, account) => sum + toKopecks(account.balanceRub ?? account.balance ?? "0"), 0n));
  const loading = accounts === undefined || (syncState.lastSyncAt === null && syncState.phase === "syncing");

  return (
    <Page title={user?.firstName ? `Здравствуйте, ${user.firstName}!` : "FinTrack"} {...refresh}>
      <SyncBanner />
      <Card onPress={() => router.push("/accounts")} testID="home-balance">
        <Label variant="caption" tone="muted">Всего на счетах</Label>
        <Money amount={total} size="title" testID="home-total" />
        <Label variant="caption" tone="muted">{active.length ? `Счетов: ${active.length}` : "Счетов пока нет"}</Label>
      </Card>

      {recent?.length ? (
        <Section title="Последние операции">
          {recent.map((tx) => <TransactionRow key={tx.id} tx={tx} category={tx.categoryId ? categories.get(tx.categoryId) : undefined} />)}
        </Section>
      ) : (
        !loading && (
          <EmptyState
            icon="receipt-outline"
            title="Операций пока нет"
            text="Запишите первую трату кнопкой «＋» внизу или импортируйте выписку на сайте."
            action={<Button title="Записать трату" icon="add" onPress={() => router.push("/quick-add")} testID="home-add" />}
          />
        )
      )}
      {recent?.length ? <Button title="Все операции" variant="link" onPress={() => router.push("/transactions")} /> : null}
    </Page>
  );
}
