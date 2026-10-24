import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { parseMoneyInput } from "@workspace/shared/money";
import { newId, store } from "@/data/device";
import { createAccount } from "@/data/mutations";
import { Button, Chip, Field, Hint, Label, Page } from "@/ui/kit";
import { ACCOUNT_KINDS } from "@/lib/accounts";

const CURRENCIES = ["RUB", "USD", "EUR", "CNY"];

/** Новый счёт (E2.1-T8): название, вид, валюта, текущий остаток. Банковские счета подключаются импортом выписки на сайте. */
export default function NewAccount() {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("debit_card");
  const [currency, setCurrency] = useState("RUB");
  const [balance, setBalance] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return setError("Введите название");
    const opening = balance.trim() ? parseMoneyInput(balance) : "0.00";
    if (!opening) return setError("Остаток — число, например 1 500,50");
    await createAccount(store, newId(), { name: name.trim(), kind, currency, openingBalance: opening });
    router.back();
  };

  return (
    <Page header={false}>
      <Field label="Название" value={name} onChangeText={setName} placeholder="Тинькофф Black" autoFocus maxLength={60} testID="account-name" />
      <View style={styles.block}>
        <Label variant="caption" tone="muted">Вид</Label>
        <View style={styles.chips}>
          {ACCOUNT_KINDS.map((item) => <Chip key={item.value} label={item.label} selected={kind === item.value} onPress={() => setKind(item.value)} testID={`account-kind-${item.value}`} />)}
        </View>
      </View>
      <View style={styles.block}>
        <Label variant="caption" tone="muted">Валюта</Label>
        <View style={styles.chips}>
          {CURRENCIES.map((item) => <Chip key={item} label={item} selected={currency === item} onPress={() => setCurrency(item)} />)}
        </View>
      </View>
      <Field label="Остаток сейчас" value={balance} onChangeText={setBalance} keyboardType="numbers-and-punctuation" placeholder="0" testID="account-balance" />
      {kind === "credit_card" && <Hint>Долг по кредитке — со знаком минус: −15 000.</Hint>}
      {error && <Hint tone="danger">{error}</Hint>}
      <Button title="Добавить счёт" onPress={() => void save()} testID="account-save" />
    </Page>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
