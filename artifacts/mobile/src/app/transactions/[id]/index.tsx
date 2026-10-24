import { useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDate } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal } from "@/data/hooks";
import { deleteTransaction } from "@/data/transactions";
import { transactionTitle, type Account, type Category, type Transaction } from "@/data/types";
import { useCategoryChange } from "@/ui/useCategoryChange";
import { Button, Card, EmptyState, Label, ListItem, Money, Page, Section } from "@/ui/kit";

const SOURCE: Record<string, string> = { manual: "вручную", import: "импорт выписки", bank: "банк", adjustment: "корректировка" };

/**
 * Карточка операции (E2.1-T7): сумма и поля, смена категории (с «эта и будущие», как на сайте), правка, удаление.
 * Сумму, дату, тип и счёт сервер разрешает менять только у ручных расходов и доходов — у импортированных их нет в правке.
 */
export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useLocal(() => store.get<Transaction>("transactions", id), [id]);
  const account = useLocal(async () => (tx ? store.get<Account>("accounts", tx.accountId) : null), [tx?.accountId]);
  const category = useLocal(async () => (tx?.categoryId ? store.get<Category>("categories", tx.categoryId) : null), [tx?.categoryId]);
  const [busy, setBusy] = useState(false);
  const { change, sheet } = useCategoryChange();

  if (tx === undefined) return null;
  if (tx === null) return <Page header={false}><EmptyState icon="search-outline" title="Операция не найдена" text="Возможно, её удалили на другом устройстве." /></Page>;

  const remove = () => {
    Alert.alert("Удалить операцию?", transactionTitle(tx), [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          setBusy(true);
          await deleteTransaction(store, tx.id);
          router.back();
        },
      },
    ]);
  };

  return (
    <Page header={false}>
      <Card>
        <Label variant="heading">{transactionTitle(tx)}</Label>
        <Money amount={tx.amount} currency={tx.currency} signed size="title" testID="tx-amount" />
        <Label variant="caption" tone="muted">{formatDate(tx.date)}{tx.time ? `, ${tx.time}` : ""}</Label>
      </Card>
      <Section>
        <ListItem icon="pricetag-outline" title={category?.name ?? "Без категории"} subtitle="Категория" onPress={() => void change(tx)} testID="tx-category" />
        <ListItem icon="card-outline" title={account?.name ?? "Счёт"} subtitle="Счёт" onPress={account ? () => router.push(`/accounts/${account.id}`) : undefined} />
        {tx.note ? <ListItem icon="document-text-outline" title={tx.note} subtitle="Заметка" /> : null}
        {tx.description && tx.description !== tx.merchant ? <ListItem icon="reader-outline" title={tx.description} subtitle="Описание из выписки" /> : null}
        {tx.excludeFromStats ? <ListItem icon="eye-off-outline" title="Не учитывается в статистике" /> : null}
        <ListItem icon="information-circle-outline" title={SOURCE[tx.source] ?? tx.source} subtitle="Источник" />
      </Section>
      {tx.type !== "transfer" && tx.type !== "adjustment" && (
        <Button title="Изменить" variant="secondary" icon="create-outline" onPress={() => router.push(`/transactions/${tx.id}/edit`)} testID="tx-edit" />
      )}
      {tx.type !== "transfer" && <Button title="Удалить" variant="danger" icon="trash-outline" onPress={remove} busy={busy} testID="tx-delete" />}
      {sheet}
    </Page>
  );
}
