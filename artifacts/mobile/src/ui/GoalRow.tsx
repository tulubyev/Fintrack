import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { formatDate } from "@workspace/shared/money";
import type { GoalWithProgress } from "@/data/useGoals";
import { Label, Progress, useColors } from "./kit";

const rub = (amount: string | number) => `${Math.round(Number(amount)).toLocaleString("ru-RU")} ₽`;

/** Подпись прогноза цели: достигнута, успевает к сроку, нужный взнос или «при нынешнем темпе не накопится». */
export function goalForecastText(goal: GoalWithProgress): string {
  const p = goal.progress;
  if (goal.completedAt || p.percent >= 100) return "Цель достигнута";
  if (p.onTrack === true && goal.targetDate) return `Успеваете к ${formatDate(goal.targetDate)}`;
  if (p.monthlyNeeded) return `Нужно ${rub(p.monthlyNeeded)} в месяц, чтобы успеть к ${formatDate(goal.targetDate)}`;
  if (p.forecastDate) return `При нынешнем темпе — к ${formatDate(p.forecastDate)}`;
  return "Пополните цель — появится прогноз";
}

/** Строка цели: накоплено из цели, полоса, прогноз. */
export function GoalRow({ goal }: { goal: GoalWithProgress }) {
  const colors = useColors();
  const p = goal.progress;
  return (
    <Pressable
      onPress={() => router.push(`/goals/${goal.id}`)}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.subtle : "transparent" }]}
      testID={`goal-${goal.id}`}
    >
      <View style={styles.head}>
        <Label numberOfLines={1}>{goal.name}</Label>
        <Label variant="caption" tone="muted">{rub(p.currentAmount)} из {rub(goal.targetAmount)}</Label>
      </View>
      <Progress value={p.percent / 100} tone={goal.completedAt || p.percent >= 100 ? "ok" : p.onTrack === false ? "warning" : "ok"} />
      <Label variant="caption" tone={p.onTrack === false ? "danger" : "muted"}>{goalForecastText(goal)}</Label>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingVertical: 12, gap: 6 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
});
