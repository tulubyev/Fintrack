import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { formatDate, fromKopecks, todayIso, toKopecks } from "@workspace/shared/money";
import { useAuth } from "@/auth/useAuth";
import { store } from "@/data/device";
import { useLocal, useLookup, useRefresh } from "@/data/hooks";
import { monthSummary, shiftMonth, upcomingPayments } from "@/data/summary";
import type { Account, Category, Series, Transaction } from "@/data/types";
import { SyncBanner } from "@/ui/SyncBanner";
import { TransactionRow } from "@/ui/TransactionRow";
import { Button, Card, EmptyState, Label, ListItem, Money, Page, PRIMARY, Section, useColors } from "@/ui/kit";

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

/**
 * Главная (E2.1-T7) — как сводка сайта, но из локальной базы: баланс, траты месяца против того же периода прошлого,
 * топ категорий, ближайшие списания, операции без категории, последние операции. Открывается мгновенно и без сети.
 */
export default function Home() {
  const { user } = useAuth();
  const colors = useColors();
  const refresh = useRefresh();
  const today = todayIso();
  const accounts = useLocal(() => store.list<Account>("accounts"), []);
  // этот и прошлый месяц — для сравнения «тот же период»
  const monthTx = useLocal(() => store.list<Transaction>("transactions", { from: `${shiftMonth(today.slice(0, 7), -1)}-01`, to: today }), [today]);
  const uncategorized = useLocal(() => store.totals("transactions", { uncategorized: true, types: ["expense", "income"] }), []);
  const recent = useLocal(() => store.list<Transaction>("transactions", { limit: 5 }), []);
  const series = useLocal(() => store.list<Series>("recurring"), []);
  const categories = useLookup<Category>("categories");

  const active = (accounts ?? []).filter((account) => !account.archivedAt && account.includeInTotal);
  const balance = fromKopecks(active.reduce((sum, account) => sum + toKopecks(account.balanceRub ?? account.balance ?? "0"), 0n));
  const summary = monthTx ? monthSummary(monthTx, [...categories.values()], today) : null;
  const upcoming = upcomingPayments(series ?? [], today).slice(0, 4);
  const empty = accounts !== undefined && recent !== undefined && !accounts.length && !recent.length;
  const month = MONTHS[Number(today.slice(5, 7)) - 1];

  return (
    <Page title={user?.firstName ? `Здравствуйте, ${user.firstName}!` : "FinTrack"} {...refresh}>
      <SyncBanner />
      <Card onPress={() => router.push("/accounts")} testID="home-balance">
        <Label variant="caption" tone="muted">Всего на счетах</Label>
        <Money amount={balance} size="title" testID="home-total" />
        <Label variant="caption" tone="muted">{active.length ? `Счетов: ${active.length}` : "Счетов пока нет"}</Label>
      </Card>

      {empty && (
        <EmptyState
          icon="sparkles-outline"
          title="Начнём"
          text="Добавьте счёт и загрузите выписку на сайте fin-wall.ru или запишите первую трату здесь."
          action={<Button title="Записать трату" icon="add" onPress={() => router.push("/quick-add")} testID="home-add" />}
        />
      )}

      {summary && Number(summary.expense) + Number(summary.income) > 0 && (
        <Card onPress={() => router.push({ pathname: "/transactions", params: { period: "month" } })} testID="home-month">
          <Label variant="caption" tone="muted">Траты за {month}</Label>
          <Money amount={summary.expense} size="title" testID="home-expense" />
          <Label variant="caption" tone={summary.expenseDeltaPct !== null && summary.expenseDeltaPct > 0 ? "danger" : "muted"}>
            {summary.expenseDeltaPct === null
              ? `Доходы: ${Number(summary.income).toLocaleString("ru-RU")} ₽`
              : `${summary.expenseDeltaPct > 0 ? "+" : ""}${summary.expenseDeltaPct}% к тому же периоду прошлого месяца`}
          </Label>
          {summary.top.length > 0 && (
            <View style={styles.bars}>
              {summary.top.map((item) => (
                <View key={item.categoryId ?? "none"} style={styles.bar}>
                  <View style={styles.barHead}>
                    <Label variant="caption" numberOfLines={1}>{item.name}</Label>
                    <Money amount={item.amount} size="caption" />
                  </View>
                  <View style={[styles.track, { backgroundColor: colors.subtle }]}>
                    <View style={[styles.fill, { width: `${Math.max(2, Math.round(item.share * 100))}%`, backgroundColor: PRIMARY }]} />
                  </View>
                </View>
              ))}
              {summary.other && <Label variant="caption" tone="muted">Остальное — {Number(summary.other.amount).toLocaleString("ru-RU")} ₽</Label>}
            </View>
          )}
        </Card>
      )}

      {uncategorized && uncategorized.count > 0 && (
        <Section>
          <ListItem
            icon="help-circle-outline"
            title={`Без категории: ${uncategorized.count}`}
            subtitle="Разметьте — бюджеты и отчёты станут точнее"
            onPress={() => router.push({ pathname: "/transactions", params: { uncategorized: "1" } })}
            testID="home-uncategorized"
          />
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Ближайшие списания">
          {upcoming.map((item) => (
            <ListItem
              key={`${item.seriesId}-${item.date}`}
              icon="calendar-outline"
              title={item.name}
              subtitle={formatDate(item.date)}
              value={<Money amount={item.amount} currency={item.currency} />}
              onPress={() => router.push(`/subscriptions/${item.seriesId}`)}
            />
          ))}
        </Section>
      )}

      {recent?.length ? (
        <>
          <Section title="Последние операции">
            {recent.map((tx) => <TransactionRow key={tx.id} tx={tx} category={tx.categoryId ? categories.get(tx.categoryId) : undefined} />)}
          </Section>
          <Button title="Все операции" variant="link" onPress={() => router.push("/transactions")} />
        </>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  bars: { gap: 10, marginTop: 8 },
  bar: { gap: 4 },
  barHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
});
