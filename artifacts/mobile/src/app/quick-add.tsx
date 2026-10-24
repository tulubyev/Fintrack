import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import { parseMoneyInput, todayIso } from "@workspace/shared/money";
import { newId, store } from "@/data/device";
import { useLocal, useLookup } from "@/data/hooks";
import { createTransaction } from "@/data/transactions";
import type { Account, Category } from "@/data/types";
import { pickCategory } from "@/lib/picker";
import { Button, Chip, Field, Hint, Label, ListItem, Section, useColors } from "@/ui/kit";

/**
 * Быстрый ввод (модальный экран «＋», каркас T6): тип, сумма, счёт, категория, получатель. Пишется в локальную базу
 * и уходит на сервер, когда есть сеть. Крупная цифровая клавиатура и подсказки категорий — T7.
 */
export default function QuickAdd() {
  const colors = useColors();
  const accounts = useLocal(() => store.list<Account>("accounts"), []);
  const categories = useLookup<Category>("categories");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const active = (accounts ?? []).filter((account) => !account.archivedAt);
  useEffect(() => {
    if (!accountId && active.length) setAccountId(active[0].id);
  }, [accountId, active]);

  const chooseCategory = async () => {
    const picked = await pickCategory(type);
    if (picked) setCategoryId(picked);
  };

  const save = async () => {
    const value = parseMoneyInput(amount, { allowNegative: false });
    if (!value || value === "0.00") return setError("Введите сумму больше нуля");
    if (!accountId) return setError("Выберите счёт");
    setError(null);
    setSaving(true);
    try {
      await createTransaction(store, newId(), { accountId, type, amount: value, date: todayIso(), merchant: merchant.trim() || null, categoryId });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const category = categoryId ? categories.get(categoryId) : undefined;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.chips}>
        <Chip label="Расход" selected={type === "expense"} onPress={() => { setType("expense"); setCategoryId(null); }} testID="quick-expense" />
        <Chip label="Доход" selected={type === "income"} onPress={() => { setType("income"); setCategoryId(null); }} testID="quick-income" />
      </View>
      <Field label="Сумма, ₽" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" autoFocus testID="quick-amount" />
      <Field label={type === "expense" ? "Где" : "От кого"} value={merchant} onChangeText={setMerchant} placeholder={type === "expense" ? "Кофейня" : "Зарплата"} testID="quick-merchant" />

      {active.length > 1 && (
        <View style={styles.block}>
          <Label variant="caption" tone="muted">Счёт</Label>
          <View style={styles.chips}>
            {active.map((account) => (
              <Chip key={account.id} label={account.name} selected={account.id === accountId} onPress={() => setAccountId(account.id)} />
            ))}
          </View>
        </View>
      )}
      {accounts !== undefined && !active.length && <Hint tone="danger">Счетов нет — добавьте счёт на сайте.</Hint>}

      <Section>
        <ListItem icon="pricetag-outline" title={category?.name ?? "Категория"} subtitle={category ? undefined : "Не выбрана — подберём сами"} onPress={() => void chooseCategory()} testID="quick-category" />
      </Section>

      {error && <Hint tone="danger">{error}</Hint>}
      <Button title="Записать" onPress={() => void save()} busy={saving} disabled={!active.length} testID="quick-save" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  block: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
