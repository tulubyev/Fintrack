import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { formatDate, formatMoney, parseMoneyInput, todayIso } from "@workspace/shared/money";
import { auth } from "@/auth/device";
import { useAuth } from "@/auth/useAuth";
import { newId, store, sync } from "@/data/device";
import { useLocal, useSyncState } from "@/data/hooks";
import { createTransaction } from "@/data/transactions";
import { APP_VERSION, FLAVOR } from "@/lib/config";
import { SyncBanner } from "@/ui/SyncBanner";
import { Button, Field, Hint, Screen, Title, useColors } from "@/ui/kit";

interface AccountRow {
  id: string;
  name: string;
  currency: string;
  archivedAt: string | null;
}

interface TransactionRow {
  id: string;
  amount: string;
  currency: string;
  date: string;
  merchant: string | null;
  description: string | null;
}

/**
 * Временная главная после входа (до T7): данные из локальной базы, быстрая трата, которая пишется и без сети,
 * плашка синхронизации. Настоящие главная и лента операций — T7.
 */
export default function Home() {
  const { user } = useAuth();
  const colors = useColors();
  const syncState = useSyncState();
  const accounts = useLocal(() => store.list<AccountRow>("accounts"), []);
  const recent = useLocal(() => store.list<TransactionRow>("transactions", { limit: 5 }), []);
  const total = useLocal(() => store.count("transactions"), []);
  const [amount, setAmount] = useState("");
  const [merchant, setMerchant] = useState("");
  const [error, setError] = useState<string | null>(null);

  const account = accounts?.find((item) => !item.archivedAt);
  const add = async () => {
    const value = parseMoneyInput(amount, { allowNegative: false });
    if (!account || !value || value === "0.00") return setError("Введите сумму больше нуля");
    setError(null);
    await createTransaction(store, newId(), { accountId: account.id, type: "expense", amount: value, date: todayIso(), merchant: merchant.trim() || null });
    setAmount("");
    setMerchant("");
  };

  const lastSync = syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "ещё не было";

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Title>{user?.firstName ? `Здравствуйте, ${user.firstName}!` : "FinTrack"}</Title>
        <SyncBanner />
        <Text style={[styles.meta, { color: colors.muted }]} testID="local-summary">
          На устройстве: счетов {accounts?.length ?? "…"}, операций {total ?? "…"} · синхронизация {syncState.phase === "syncing" ? "идёт…" : lastSync}
        </Text>

        {account ? (
          <View style={styles.form}>
            <Field label={`Трата со счёта «${account.name}»`} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" testID="quick-amount" />
            <Field label="Где" value={merchant} onChangeText={setMerchant} placeholder="Кофейня" testID="quick-merchant" />
            {error && <Hint tone="danger">{error}</Hint>}
            <Button title="Записать" onPress={() => void add()} testID="quick-add" />
          </View>
        ) : (
          <Hint>Счетов на устройстве пока нет — добавьте счёт на сайте, он появится после синхронизации.</Hint>
        )}

        {recent?.map((tx) => (
          <View key={tx.id} style={[styles.row, { borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground }} numberOfLines={1}>{tx.merchant ?? tx.description ?? "Без названия"}</Text>
            <Text style={{ color: colors.muted }}>{formatDate(tx.date)} · {formatMoney(tx.amount, tx.currency, { signed: true })}</Text>
          </View>
        ))}

        <Button title="Синхронизировать" variant="link" onPress={() => void sync.sync({ now: true })} testID="sync-now" />
        <Text style={[styles.meta, { color: colors.muted }]}>Версия {APP_VERSION} · {FLAVOR}</Text>
        <Button title="Выйти" variant="link" onPress={() => void auth.logout()} testID="logout" />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, paddingVertical: 24 },
  meta: { fontSize: 13 },
  form: { gap: 10 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8, gap: 2 },
});
