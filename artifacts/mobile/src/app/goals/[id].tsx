import { useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDate } from "@workspace/shared/money";
import { newId, store } from "@/data/device";
import { useLocal } from "@/data/hooks";
import { addContribution, deleteContribution, deleteGoal, setGoalArchived } from "@/data/mutations";
import { useGoals } from "@/data/useGoals";
import type { Account, GoalContribution } from "@/data/types";
import { AmountSheet } from "@/ui/AmountSheet";
import { goalForecastText } from "@/ui/GoalRow";
import { SwipeRow } from "@/ui/SwipeRow";
import { Button, Card, EmptyState, Label, ListItem, Money, Page, Progress, Section } from "@/ui/kit";

const rub = (amount: string | number) => `${Math.round(Number(amount)).toLocaleString("ru-RU")} ₽`;

/**
 * Цель (E2.1-T8): накоплено, прогноз и нужный взнос; взносы — пополнить, снять (отрицательный взнос), удалить свайпом.
 * У цели, привязанной к счёту, прогресс — остаток счёта, взносы не нужны. Архив и удаление.
 */
export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const goals = useGoals();
  const goal = goals?.find((item) => item.id === id);
  const contributions = useLocal(() => store.list<GoalContribution>("goalContributions", { fields: { goalId: id } }), [id]);
  const account = useLocal(async () => (goal?.accountId ? store.get<Account>("accounts", goal.accountId) : null), [goal?.accountId]);
  const [sheet, setSheet] = useState<"in" | "out" | null>(null);

  if (goals === undefined) return null;
  if (!goal) return <Page header={false}><EmptyState icon="search-outline" title="Цель не найдена" /></Page>;
  const p = goal.progress;

  const remove = () =>
    Alert.alert("Удалить цель?", `«${goal.name}» и её взносы будут удалены.`, [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => void deleteGoal(store, id).then(() => router.back()) },
    ]);

  return (
    <Page header={false}>
      <Card>
        <Label variant="heading">{goal.name}</Label>
        <Money amount={p.currentAmount} size="title" testID="goal-current" />
        <Progress value={p.percent / 100} tone={p.onTrack === false ? "warning" : "ok"} />
        <Label variant="caption" tone="muted">
          {p.percent}% из {rub(goal.targetAmount)}{goal.targetDate ? ` · срок ${formatDate(goal.targetDate)}` : ""}
        </Label>
        <Label variant="caption" tone={p.onTrack === false ? "danger" : "muted"}>{goalForecastText(goal)}</Label>
        {Number(p.avgMonthlyGrowth) > 0 && <Label variant="caption" tone="muted">В среднем +{rub(p.avgMonthlyGrowth)} в месяц за 3 месяца</Label>}
      </Card>

      {p.linked ? (
        <Section>
          <ListItem icon="card-outline" title={account?.name ?? "Счёт"} subtitle="Прогресс — остаток этого счёта" onPress={account ? () => router.push(`/accounts/${account.id}`) : undefined} />
        </Section>
      ) : (
        !goal.archivedAt && (
          <>
            <Button title="Пополнить" icon="add" onPress={() => setSheet("in")} testID="goal-deposit" />
            <Button title="Снять" variant="secondary" icon="remove" onPress={() => setSheet("out")} testID="goal-withdraw" />
          </>
        )
      )}

      {!p.linked && contributions && contributions.length > 0 && (
        <Section title="Взносы">
          {contributions.map((item) => (
            <SwipeRow key={item.id} right={{ label: "Удалить", icon: "trash-outline", tone: "danger", onPress: () => void deleteContribution(store, item.id, id) }}>
              <ListItem title={item.note ?? (item.amount.startsWith("-") ? "Снятие" : "Пополнение")} subtitle={formatDate(item.date)} value={<Money amount={item.amount} signed />} />
            </SwipeRow>
          ))}
        </Section>
      )}

      <Button title={goal.archivedAt ? "Вернуть из архива" : "В архив"} variant="secondary" icon="archive-outline" onPress={() => void setGoalArchived(store, id, !goal.archivedAt)} testID="goal-archive" />
      <Button title="Удалить цель" variant="danger" icon="trash-outline" onPress={remove} testID="goal-delete" />

      <AmountSheet
        visible={sheet !== null}
        title={sheet === "out" ? "Снять с цели" : "Пополнить цель"}
        label="Сумма, ₽"
        withNote
        submitTitle={sheet === "out" ? "Снять" : "Пополнить"}
        onClose={() => setSheet(null)}
        onSubmit={(amount, note) => addContribution(store, newId(), id, { amount: sheet === "out" ? `-${amount}` : amount, note })}
      />
    </Page>
  );
}
