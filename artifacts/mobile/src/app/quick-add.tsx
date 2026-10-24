import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { todayIso } from "@workspace/shared/money";
import { newId, store } from "@/data/device";
import { useLocal, useLookup } from "@/data/hooks";
import { frequentCategories } from "@/data/summary";
import { createTransaction } from "@/data/transactions";
import type { Account, Category, Transaction } from "@/data/types";
import { applyAmountKey, displayAmount, toApiAmount } from "@/lib/amountInput";
import { shiftDate } from "@/lib/dates";
import { pickCategory } from "@/lib/picker";
import { DateField } from "@/ui/DateField";
import { NumPad } from "@/ui/NumPad";
import { Button, Chip, Field, Hint, Label, useColors } from "@/ui/kit";

/**
 * Быстрый ввод (модальный «＋», E2.1-T7): сумма с крупной клавиатуры, частые категории, дата, счёт, получатель, заметка.
 * Пишется в локальную базу и уходит на сервер, когда есть сеть. Без категории её подберёт сервер (правила, мерчант, MCC).
 */
export default function QuickAdd() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const today = todayIso();
  const accounts = useLocal(() => store.list<Account>("accounts"), []);
  const recent = useLocal(() => store.list<Transaction>("transactions", { from: shiftDate(today, -90), types: ["expense", "income"] }), [today]);
  const categories = useLookup<Category>("categories");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [details, setDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const active = useMemo(() => (accounts ?? []).filter((account) => !account.archivedAt), [accounts]);
  useEffect(() => {
    // по умолчанию — счёт последней ручной операции, иначе первый
    if (accountId || !active.length) return;
    const last = recent?.find((tx) => tx.source === "manual" && active.some((account) => account.id === tx.accountId));
    setAccountId(last?.accountId ?? active[0].id);
  }, [accountId, active, recent]);

  const frequent = frequentCategories(recent ?? [], type, today).filter((id) => categories.has(id));
  const chips = categoryId && !frequent.includes(categoryId) ? [categoryId, ...frequent.slice(0, 5)] : frequent;
  const account = active.find((item) => item.id === accountId);
  const currency = account?.currency ?? "RUB";

  const chooseCategory = async () => {
    const picked = await pickCategory({ kind: type });
    if (picked) setCategoryId(picked);
  };

  const save = async () => {
    const value = toApiAmount(amount);
    if (!value) return setError("Введите сумму");
    if (!accountId) return setError("Нет счёта — добавьте его на сайте");
    setError(null);
    setSaving(true);
    try {
      await createTransaction(store, newId(), {
        accountId, type, amount: value, date, categoryId, merchant: merchant.trim() || null, note: note.trim() || null,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingBottom: insets.bottom + 12 }]}>
      <ScrollView contentContainerStyle={styles.top} keyboardShouldPersistTaps="handled">
        <View style={styles.chips}>
          <Chip label="Расход" selected={type === "expense"} onPress={() => { setType("expense"); setCategoryId(null); }} testID="quick-expense" />
          <Chip label="Доход" selected={type === "income"} onPress={() => { setType("income"); setCategoryId(null); }} testID="quick-income" />
        </View>

        <Text style={[styles.amount, { color: amount ? colors.foreground : colors.muted }]} testID="quick-amount" numberOfLines={1} adjustsFontSizeToFit>
          {type === "expense" && amount ? "−" : ""}{displayAmount(amount)} {currency === "RUB" ? "₽" : currency}
        </Text>

        <View style={styles.block}>
          <Label variant="caption" tone="muted">Категория</Label>
          <View style={styles.chips}>
            {chips.map((id) => (
              <Chip key={id} label={categories.get(id)?.name ?? "…"} selected={categoryId === id} onPress={() => setCategoryId(categoryId === id ? null : id)} testID={`quick-cat-${id}`} />
            ))}
            <Chip label={chips.length ? "Другая…" : "Выбрать…"} onPress={() => void chooseCategory()} testID="quick-category" />
          </View>
          {!categoryId && <Hint>Без категории — подберём сами по получателю.</Hint>}
        </View>

        {active.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {active.map((item) => <Chip key={item.id} label={item.name} selected={item.id === accountId} onPress={() => setAccountId(item.id)} />)}
          </ScrollView>
        )}
        {accounts !== undefined && !active.length && <Hint tone="danger">Счетов нет — добавьте счёт на сайте.</Hint>}

        <DateField value={date} onChange={setDate} />

        {details ? (
          <>
            <Field label={type === "expense" ? "Где" : "От кого"} value={merchant} onChangeText={setMerchant} placeholder={type === "expense" ? "Кофейня" : "Зарплата"} testID="quick-merchant" />
            <Field label="Заметка" value={note} onChangeText={setNote} testID="quick-note" />
          </>
        ) : (
          <Button title="Добавить получателя и заметку" variant="link" onPress={() => setDetails(true)} testID="quick-details" />
        )}
      </ScrollView>

      <View style={styles.bottom}>
        {error && <Hint tone="danger">{error}</Hint>}
        <NumPad onKey={(key) => setAmount(applyAmountKey(amount, key))} />
        <Button title="Записать" onPress={() => void save()} busy={saving} disabled={!amount || !active.length} testID="quick-save" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { padding: 16, gap: 14 },
  bottom: { paddingHorizontal: 16, gap: 10 },
  block: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  amount: { fontSize: 44, fontWeight: "700", textAlign: "center", fontVariant: ["tabular-nums"] },
});
