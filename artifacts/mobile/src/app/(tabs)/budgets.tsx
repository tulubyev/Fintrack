import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { todayIso } from "@workspace/shared/money";
import { shiftMonth } from "@/data/budgets";
import { useRefresh } from "@/data/hooks";
import { useMonthBudgets } from "@/data/useBudgets";
import { monthTitle } from "@/lib/dates";
import { BudgetRow } from "@/ui/BudgetRow";
import { Button, Card, EmptyState, Icon, Label, ListItem, Money, Page, Progress, Section } from "@/ui/kit";

/**
 * Бюджеты (E2.1-T8): прогресс месяца из локальной базы — та же логика, что на сайте (data/budgets.ts): перенос остатка,
 * общий бюджет с исключениями, подкатегории внутри родителя, «ожидалось к сегодня», траты без бюджета.
 */
export default function Budgets() {
  const refresh = useRefresh();
  const current = todayIso().slice(0, 7);
  const [month, setMonth] = useState(current);
  const data = useMonthBudgets(month);
  const total = data ? Number(data.total.amount) : 0;

  return (
    <Page title="Бюджеты" {...refresh} right={<Button title="Добавить" variant="link" onPress={() => router.push("/budgets/new")} testID="budget-add" />}>
      <View style={styles.months}>
        <Pressable onPress={() => setMonth(shiftMonth(month, -1))} hitSlop={12} accessibilityLabel="Прошлый месяц" testID="month-prev">
          <Icon name="chevron-back" tone="primary" />
        </Pressable>
        <Label variant="heading" testID="month-title">{monthTitle(month)}</Label>
        <Pressable onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= current} hitSlop={12} accessibilityLabel="Следующий месяц" testID="month-next">
          <Icon name="chevron-forward" tone={month >= current ? "muted" : "primary"} />
        </Pressable>
      </View>

      {data && data.items.length === 0 ? (
        <EmptyState
          icon="pie-chart-outline"
          title="Бюджетов нет"
          text="Задайте лимит на категорию или общий бюджет месяца — приложение покажет, сколько осталось и не обгоняют ли траты месяц."
          action={<Button title="Добавить бюджет" icon="add" onPress={() => router.push("/budgets/new")} />}
        />
      ) : data ? (
        <>
          <Card>
            <Label variant="caption" tone="muted">Потрачено из бюджетов</Label>
            <Money amount={data.total.spent} size="title" testID="budgets-spent" />
            <Progress value={total > 0 ? Number(data.total.spent) / total : 0} tone={Number(data.total.remaining) < 0 ? "over" : "ok"} />
            <Label variant="caption" tone={Number(data.total.remaining) < 0 ? "danger" : "muted"}>
              {Number(data.total.remaining) < 0 ? "Перерасход" : "Осталось"} {Math.abs(Math.round(Number(data.total.remaining))).toLocaleString("ru-RU")} ₽ из {Math.round(total).toLocaleString("ru-RU")} ₽
            </Label>
          </Card>
          <Section>
            {data.items.flatMap((item) => [
              <BudgetRow key={item.id} budget={item} month={month} />,
              ...(item.children ?? []).map((child) => <BudgetRow key={child.id} budget={child} month={month} nested />),
            ])}
          </Section>
          {Number(data.unbudgetedSpent) > 0 && (
            <Section>
              <ListItem
                icon="help-circle-outline"
                title="Траты без бюджета"
                value={<Money amount={data.unbudgetedSpent} />}
                onPress={month === current ? () => router.push({ pathname: "/transactions", params: { period: "month" } }) : undefined}
                chevron={false}
              />
            </Section>
          )}
        </>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  months: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
