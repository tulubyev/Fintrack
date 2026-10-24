import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { toKopecks } from "@workspace/shared/money";
import type { BudgetStatus } from "@/data/budgets";
import { Label, Money, Progress, useColors } from "./kit";

const rub = (amount: string) => `${Math.round(Number(amount)).toLocaleString("ru-RU")} ₽`;

/** Строка бюджета: потрачено из лимита, полоса с отметкой «ожидалось к сегодня», остаток или перерасход. */
export function BudgetRow({ budget, month, nested = false }: { budget: BudgetStatus; month?: string; nested?: boolean }) {
  const colors = useColors();
  const limit = Number(budget.effectiveAmount);
  const over = toKopecks(budget.remaining) < 0n;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/budgets/[id]", params: month ? { id: budget.id, month } : { id: budget.id } })}
      style={({ pressed }) => [styles.row, nested && styles.nested, { backgroundColor: pressed ? colors.subtle : "transparent" }]}
      testID={`budget-${budget.id}`}
    >
      <View style={styles.head}>
        <Label numberOfLines={1}>{budget.name}</Label>
        <Label variant="caption" tone={budget.status === "over" ? "danger" : "muted"}>
          {rub(budget.spent)} из {rub(budget.effectiveAmount)}
        </Label>
      </View>
      <Progress value={limit > 0 ? Number(budget.spent) / limit : 0} marker={limit > 0 ? Number(budget.expectedByToday) / limit : undefined} tone={budget.status} />
      <View style={styles.head}>
        <Label variant="caption" tone={over ? "danger" : "muted"}>{over ? "Перерасход" : "Осталось"}</Label>
        <Money amount={over ? budget.remaining.replace("-", "") : budget.remaining} size="caption" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  nested: { paddingLeft: 32 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
});
