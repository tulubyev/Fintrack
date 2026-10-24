import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { parseMoneyInput, todayIso } from "@workspace/shared/money";
import { newId, store } from "@/data/device";
import { addMonths } from "@/data/goals";
import { addContribution, createGoal } from "@/data/mutations";
import { Button, Chip, Field, Hint, Label, Page } from "@/ui/kit";

const TERMS = [
  { label: "Без срока", months: 0 },
  { label: "3 месяца", months: 3 },
  { label: "Полгода", months: 6 },
  { label: "Год", months: 12 },
  { label: "2 года", months: 24 },
];

/**
 * Новая цель (E2.1-T8): название, сумма, срок, уже отложено. Отложенное становится первым взносом — как initialAmount
 * на сайте. Привязка к счёту — на сайте.
 */
export default function NewGoal() {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [months, setMonths] = useState(0);
  const [initial, setInitial] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const amount = parseMoneyInput(target, { allowNegative: false });
    const start = initial.trim() ? parseMoneyInput(initial, { allowNegative: false }) : null;
    if (!name.trim()) return setError("Введите название");
    if (!amount || amount === "0.00") return setError("Введите сумму цели");
    if (initial.trim() && !start) return setError("Уже отложено — число, например 10 000");
    const id = newId();
    await createGoal(store, id, { name: name.trim(), targetAmount: amount, targetDate: months ? addMonths(todayIso(), months) : null });
    if (start && start !== "0.00") await addContribution(store, newId(), id, { amount: start, note: "Уже было отложено" });
    router.back();
  };

  return (
    <Page header={false}>
      <Field label="На что копим" value={name} onChangeText={setName} placeholder="Отпуск" autoFocus maxLength={100} testID="goal-name" />
      <Field label="Сумма, ₽" value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder="150 000" testID="goal-target" />
      <View style={styles.block}>
        <Label variant="caption" tone="muted">Срок</Label>
        <View style={styles.chips}>
          {TERMS.map((item) => <Chip key={item.months} label={item.label} selected={months === item.months} onPress={() => setMonths(item.months)} testID={`goal-term-${item.months}`} />)}
        </View>
      </View>
      <Field label="Уже отложено, ₽" value={initial} onChangeText={setInitial} keyboardType="decimal-pad" placeholder="0" testID="goal-initial" />
      {months > 0 && <Hint>Приложение посчитает, сколько откладывать в месяц, чтобы успеть.</Hint>}
      {error && <Hint tone="danger">{error}</Hint>}
      <Button title="Создать цель" onPress={() => void save()} testID="goal-save" />
    </Page>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
