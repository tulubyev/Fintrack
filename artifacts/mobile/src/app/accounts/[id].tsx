import { useState } from "react";
import { Alert, Switch } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { store } from "@/data/device";
import { useLocal, useLookup } from "@/data/hooks";
import { adjustBalance, setAccountArchived, updateAccount } from "@/data/mutations";
import type { Account, Category, Transaction } from "@/data/types";
import { fromApiAmount } from "@/lib/amountInput";
import { AmountSheet } from "@/ui/AmountSheet";
import { TransactionRow } from "@/ui/TransactionRow";
import { Button, Card, EmptyState, Field, Label, ListItem, Money, Page, PRIMARY, Section, Sheet } from "@/ui/kit";

/**
 * Счёт (E2.1-T8): остаток и операции; переименование, «учитывать в балансе», корректировка остатка (сервер заводит
 * операцию-корректировку на разницу), архив. Остаток пересчитывает сервер — после синхронизации он точный.
 */
export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const account = useLocal(() => store.get<Account>("accounts", id), [id]);
  const transactions = useLocal(() => store.list<Transaction>("transactions", { accountId: id, limit: 50 }), [id]);
  const categories = useLookup<Category>("categories");
  const [adjusting, setAdjusting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");

  if (account === undefined) return null;
  if (account === null) return <Page header={false}><EmptyState icon="search-outline" title="Счёт не найден" /></Page>;

  const archive = () =>
    Alert.alert(account.archivedAt ? "Вернуть счёт из архива?" : "Убрать счёт в архив?", account.archivedAt ? undefined : "Операции останутся, новые в архивный счёт не записываются.", [
      { text: "Отмена", style: "cancel" },
      { text: account.archivedAt ? "Вернуть" : "В архив", onPress: () => void setAccountArchived(store, id, !account.archivedAt) },
    ]);

  return (
    <Page header={false}>
      <Card>
        <Label variant="heading">{account.name}</Label>
        <Money amount={account.balance} currency={account.currency} size="title" testID="account-balance" />
        {account.archivedAt && <Label variant="caption" tone="muted">В архиве</Label>}
      </Card>
      <Section>
        <ListItem icon="calculator-outline" title="Указать фактический остаток" subtitle="Разница запишется корректировкой" onPress={() => setAdjusting(true)} testID="account-adjust" />
        <ListItem icon="create-outline" title="Переименовать" onPress={() => { setName(account.name); setRenaming(true); }} testID="account-rename" />
        <ListItem
          icon="calculator"
          title="Учитывать в балансе"
          subtitle="Входит в «Всего на счетах»"
          right={<Switch value={account.includeInTotal} onValueChange={(includeInTotal) => void updateAccount(store, id, { includeInTotal })} trackColor={{ true: PRIMARY }} testID="account-include" />}
        />
      </Section>

      {transactions?.length ? (
        <Section title="Операции">
          {transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} category={tx.categoryId ? categories.get(tx.categoryId) : undefined} />)}
        </Section>
      ) : (
        transactions && <EmptyState icon="receipt-outline" title="Операций по счёту нет" />
      )}
      {transactions && transactions.length >= 50 && (
        <Button title="Все операции счёта" variant="link" onPress={() => router.push({ pathname: "/transactions", params: { accountId: account.id } })} />
      )}
      {!account.archivedAt && (
        <Button title="Загрузить выписку" variant="secondary" icon="document-attach-outline" onPress={() => router.push({ pathname: "/import", params: { accountId: account.id } })} testID="account-import" />
      )}
      <Button title={account.archivedAt ? "Вернуть из архива" : "В архив"} variant="secondary" icon="archive-outline" onPress={archive} testID="account-archive" />

      <AmountSheet
        visible={adjusting}
        title="Фактический остаток"
        label={`Сейчас на счёте, ${account.currency === "RUB" ? "₽" : account.currency}`}
        initial={`${account.balance.startsWith("-") ? "-" : ""}${fromApiAmount(account.balance)}`}
        allowNegative
        hint="Если остаток в приложении разошёлся с банком — укажите, сколько на самом деле. Разница станет операцией «Корректировка»."
        onClose={() => setAdjusting(false)}
        onSubmit={(amount) => adjustBalance(store, id, amount, account.currency)}
      />
      <Sheet visible={renaming} onClose={() => setRenaming(false)} title="Название счёта">
        <Field label="Название" value={name} onChangeText={setName} autoFocus maxLength={60} testID="account-rename-input" />
        <Button
          title="Сохранить"
          disabled={!name.trim()}
          onPress={() => {
            void updateAccount(store, id, { name: name.trim() });
            setRenaming(false);
          }}
        />
      </Sheet>
    </Page>
  );
}
