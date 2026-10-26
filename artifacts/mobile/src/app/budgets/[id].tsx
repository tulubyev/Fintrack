import { useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { todayIso } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal, useLookup } from "@/data/hooks";
import { deleteBudget, updateBudget } from "@/data/mutations";
import { useMonthBudgets } from "@/data/useBudgets";
import type { Budget, Category, Transaction } from "@/data/types";
import { fromApiAmount } from "@/lib/amountInput";
import { monthTitle } from "@/lib/dates";
import { AmountSheet } from "@/ui/AmountSheet";
import { TransactionRow } from "@/ui/TransactionRow";
import { Button, Card, EmptyState, Label, ListItem, Money, Page, Progress, Section, Toggle } from "@/ui/kit";

const rub = (amount: number) => `${Math.round(amount).toLocaleString("ru-RU")} ₽`;
const daysInMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * Бюджет (E2.1-T8): потрачено из лимита, темп («ожидалось к сегодня», сколько можно тратить в день до конца месяца),
 * операции бюджета за месяц; правка лимита и переноса остатка, удаление. Правка и удаление — с текущего месяца, как на сайте.
 */
export default function BudgetScreen() {
  const { id, month: monthParam } = useLocalSearchParams<{ id: string; month?: string }>();
  const today = todayIso();
  const month = monthParam ?? today.slice(0, 7);
  const data = useMonthBudgets(month);
  const row = useLocal(() => store.get<Budget>("budgets", id), [id]);
  const categories = useLookup<Category>("categories");
  const [editing, setEditing] = useState(false);
  const status = data?.items.flatMap((item) => [item, ...(item.children ?? [])]).find((item) => item.id === id);
  const subtree = status?.categoryId
    ? [status.categoryId, ...[...categories.values()].filter((item) => item.parentId === status.categoryId).map((item) => item.id)]
    : null;
  const transactions = useLocal(
    async () => (subtree ? store.list<Transaction>("transactions", { categoryIds: subtree, from: `${month}-01`, to: `${month}-31`, limit: 100 }) : []),
    [month, subtree?.join(",")],
  );

  if (row === undefined || data === undefined) return null;
  if (row === null || !status) return <Page header={false}><EmptyState icon="search-outline" title="Бюджета нет" text="Возможно, его удалили или он не действует в этом месяце." /></Page>;

  const limit = Number(status.effectiveAmount);
  const spent = Number(status.spent);
  const remaining = Number(status.remaining);
  const current = month === today.slice(0, 7);
  const daysLeft = current ? daysInMonth(month) - Number(today.slice(8, 10)) + 1 : 0;

  const remove = () =>
    Alert.alert("Удалить бюджет?", `${status.name}: с этого месяца лимита не будет. Прошлые месяцы не изменятся.`, [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => void deleteBudget(store, id).then(() => router.back()) },
    ]);

  return (
    <Page header={false}>
      <Card>
        <Label variant="heading">{status.name}</Label>
        <Label variant="caption" tone="muted">{monthTitle(month)}</Label>
        <Money amount={status.spent} size="title" testID="budget-spent" />
        <Progress value={limit > 0 ? spent / limit : 0} marker={limit > 0 ? Number(status.expectedByToday) / limit : undefined} tone={status.status} />
        <Label variant="caption" tone={remaining < 0 ? "danger" : "muted"}>
          {remaining < 0 ? `Перерасход ${rub(-remaining)}` : `Осталось ${rub(remaining)}`} из {rub(limit)}
          {status.effectiveAmount !== status.amount ? ` (лимит ${rub(Number(status.amount))} + перенос)` : ""}
        </Label>
        {current && remaining > 0 && (
          <Label variant="caption" tone={spent > Number(status.expectedByToday) ? "danger" : "muted"}>
            {spent > Number(status.expectedByToday) ? "Траты обгоняют месяц" : "Идёте в темпе"} · можно {rub(remaining / daysLeft)} в день до конца месяца
          </Label>
        )}
      </Card>

      {current && (
        <Section>
          <ListItem icon="create-outline" title="Лимит" value={<Money amount={status.amount} />} onPress={() => setEditing(true)} testID="budget-edit" />
          <ListItem
            icon="return-down-forward-outline"
            title="Переносить остаток"
            subtitle="Несъеденный остаток добавится к лимиту следующего месяца"
            right={<Toggle value={row.rollover} onValueChange={(rollover) => void updateBudget(store, id, { rollover })} testID="budget-rollover" />}
          />
        </Section>
      )}

      {transactions && transactions.length > 0 && (
        <Section title="Операции">
          {transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} category={tx.categoryId ? categories.get(tx.categoryId) : undefined} />)}
        </Section>
      )}
      {current && <Button title="Удалить бюджет" variant="danger" icon="trash-outline" onPress={remove} testID="budget-delete" />}

      <AmountSheet
        visible={editing}
        title="Лимит на месяц"
        label="Сумма, ₽"
        initial={fromApiAmount(status.amount)}
        hint="Новый лимит действует с этого месяца."
        onClose={() => setEditing(false)}
        onSubmit={(amount) => updateBudget(store, id, { amount })}
      />
    </Page>
  );
}
