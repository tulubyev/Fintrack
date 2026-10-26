import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { parseMoneyInput, todayIso } from "@workspace/shared/money";
import { newId, store } from "@/data/device";
import { useLocal, useLookup } from "@/data/hooks";
import { createBudget } from "@/data/mutations";
import type { Budget, Category } from "@/data/types";
import { pickCategory } from "@/lib/picker";
import { Button, Chip, Field, Hint, ListItem, Page, Section, Toggle } from "@/ui/kit";

/**
 * Новый бюджет (E2.1-T8): на категорию расходов или общий на месяц, лимит, перенос остатка. Действует с текущего месяца.
 * Категории с действующим бюджетом не предлагаются: сервер ответил бы «уже есть бюджет».
 */
export default function NewBudget() {
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const budgets = useLocal(() => store.list<Budget>("budgets"), []);
  const categories = useLookup<Category>("categories");
  const [total, setTotal] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [rollover, setRollover] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = (budgets ?? []).filter((budget) => budget.effectiveFrom <= monthStart && (!budget.effectiveTo || budget.effectiveTo >= monthStart));
  const taken = new Set(active.map((budget) => budget.categoryId));

  const choose = async () => {
    const picked = await pickCategory({ kind: "expense" });
    if (!picked) return;
    if (taken.has(picked)) return setError(`На «${categories.get(picked)?.name}» бюджет уже есть — измените его в списке`);
    setError(null);
    setCategoryId(picked);
  };

  const save = async () => {
    const value = parseMoneyInput(amount, { allowNegative: false });
    if (!total && !categoryId) return setError("Выберите категорию");
    if (!value || value === "0.00") return setError("Введите лимит");
    if (total && taken.has(null)) return setError("Общий бюджет уже есть");
    await createBudget(store, newId(), { categoryId: total ? null : categoryId, amount: value, rollover });
    router.back();
  };

  return (
    <Page header={false}>
      <View style={styles.chips}>
        <Chip label="На категорию" selected={!total} onPress={() => setTotal(false)} testID="budget-kind-category" />
        <Chip label="Общий на месяц" selected={total} onPress={() => setTotal(true)} testID="budget-kind-total" />
      </View>
      {total ? (
        <Hint>Все расходы месяца, включая операции без категории.</Hint>
      ) : (
        <Section>
          <ListItem icon="pricetag-outline" title={categoryId ? categories.get(categoryId)?.name ?? "Категория" : "Выбрать категорию"} onPress={() => void choose()} testID="budget-category" />
        </Section>
      )}
      <Field label="Лимит в месяц, ₽" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="10 000" testID="budget-amount" />
      <Section>
        <ListItem
          icon="return-down-forward-outline"
          title="Переносить остаток"
          subtitle="Несъеденный остаток добавится к следующему месяцу"
          right={<Toggle value={rollover} onValueChange={setRollover} testID="budget-new-rollover" />}
        />
      </Section>
      {error && <Hint tone="danger">{error}</Hint>}
      <Button title="Создать бюджет" onPress={() => void save()} testID="budget-save" />
    </Page>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
