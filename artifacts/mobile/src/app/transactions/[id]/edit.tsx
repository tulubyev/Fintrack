import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { parseMoneyInput } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal } from "@/data/hooks";
import { updateTransaction, type TransactionPatch } from "@/data/transactions";
import type { Account, Transaction } from "@/data/types";
import { fromApiAmount } from "@/lib/amountInput";
import { DateField } from "@/ui/DateField";
import { Button, Chip, EmptyState, Field, Hint, Label, ListItem, Page, Section, Toggle } from "@/ui/kit";

/**
 * Правка операции (E2.1-T7). Сумму, тип, дату и счёт сервер разрешает менять только у ручных расходов и доходов
 * (OPERATION_NOT_ALLOWED) — у импортированных этих полей нет; счёт — только той же валюты. Получатель, заметку и
 * «не учитывать в статистике» можно у всех. Категория меняется в карточке (там же «эта и будущие»).
 * Уходит только изменённое — правка без сети встаёт в очередь.
 */
export default function EditTransaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useLocal(() => store.get<Transaction>("transactions", id), [id]);
  const accounts = useLocal(() => store.list<Account>("accounts"), []);
  const [form, setForm] = useState<{ type: "expense" | "income"; amount: string; date: string; accountId: string; merchant: string; note: string; exclude: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tx && !form) {
      setForm({
        type: tx.type === "income" ? "income" : "expense",
        amount: fromApiAmount(tx.amount),
        date: tx.date,
        accountId: tx.accountId,
        merchant: tx.merchant ?? "",
        note: tx.note ?? "",
        exclude: tx.excludeFromStats,
      });
    }
  }, [tx, form]);

  if (tx === null) return <Page header={false}><EmptyState icon="search-outline" title="Операция не найдена" /></Page>;
  if (tx === undefined || !form) return null;

  const core = tx.source === "manual" && (tx.type === "expense" || tx.type === "income");
  const sameCurrency = (accounts ?? []).filter((account) => !account.archivedAt && account.currency === tx.currency);
  const set = (patch: Partial<typeof form>) => setForm({ ...form, ...patch });

  const save = async () => {
    const patch: TransactionPatch = {};
    if (core) {
      const amount = parseMoneyInput(form.amount, { allowNegative: false });
      if (!amount || amount === "0.00") return setError("Введите сумму больше нуля");
      if (amount !== tx.amount.replace("-", "")) patch.amount = amount;
      if (form.type !== tx.type) patch.type = form.type;
      if (form.date !== tx.date) patch.date = form.date;
      if (form.accountId !== tx.accountId) patch.accountId = form.accountId;
    }
    if ((form.merchant.trim() || null) !== (tx.merchant ?? null)) patch.merchant = form.merchant.trim() || null;
    if ((form.note.trim() || null) !== (tx.note ?? null)) patch.note = form.note.trim() || null;
    if (form.exclude !== tx.excludeFromStats) patch.excludeFromStats = form.exclude;
    setError(null);
    if (Object.keys(patch).length) {
      setSaving(true);
      try {
        await updateTransaction(store, tx.id, patch);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } finally {
        setSaving(false);
      }
    }
    router.back();
  };

  return (
    <Page header={false}>
      {core ? (
        <>
          <View style={styles.chips}>
            <Chip label="Расход" selected={form.type === "expense"} onPress={() => set({ type: "expense" })} testID="edit-expense" />
            <Chip label="Доход" selected={form.type === "income"} onPress={() => set({ type: "income" })} testID="edit-income" />
          </View>
          <Field label={`Сумма, ${tx.currency === "RUB" ? "₽" : tx.currency}`} value={form.amount} onChangeText={(amount) => set({ amount })} keyboardType="decimal-pad" testID="edit-amount" />
          <DateField value={form.date} onChange={(date) => set({ date })} />
          {sameCurrency.length > 1 && (
            <View style={styles.block}>
              <Label variant="caption" tone="muted">Счёт</Label>
              <View style={styles.chips}>
                {sameCurrency.map((account) => (
                  <Chip key={account.id} label={account.name} selected={form.accountId === account.id} onPress={() => set({ accountId: account.id })} />
                ))}
              </View>
            </View>
          )}
        </>
      ) : (
        <Hint>Сумму, дату и счёт операции из выписки или банка поменять нельзя — они как в банке.</Hint>
      )}
      <Field label={form.type === "income" ? "От кого" : "Получатель"} value={form.merchant} onChangeText={(merchant) => set({ merchant })} testID="edit-merchant" />
      <Field label="Заметка" value={form.note} onChangeText={(note) => set({ note })} multiline testID="edit-note" />
      <Section>
        <ListItem
          icon="eye-off-outline"
          title="Не учитывать в статистике"
          subtitle="Не попадёт в траты, бюджеты и отчёты"
          right={<Toggle value={form.exclude} onValueChange={(exclude) => set({ exclude })} testID="edit-exclude" />}
        />
      </Section>
      {error && <Hint tone="danger">{error}</Hint>}
      <Button title="Сохранить" onPress={() => void save()} busy={saving} testID="edit-save" />
    </Page>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
