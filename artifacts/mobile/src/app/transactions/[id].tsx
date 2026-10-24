import { useState } from "react";
import { Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { formatDate } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal } from "@/data/hooks";
import { deleteTransaction, updateTransaction } from "@/data/transactions";
import { transactionTitle, type Account, type Category, type Transaction } from "@/data/types";
import { pickCategory } from "@/lib/picker";
import { Button, Card, EmptyState, Label, ListItem, Money, Page, Section } from "@/ui/kit";

const SOURCE: Record<string, string> = { manual: "вручную", import: "импорт выписки", bank: "банк", adjustment: "корректировка" };

/** Карточка операции (каркас T6): поля, смена категории, удаление. Полное редактирование — T7. */
export default function TransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tx = useLocal(() => store.get<Transaction>("transactions", id), [id]);
  const account = useLocal(async () => (tx ? store.get<Account>("accounts", tx.accountId) : null), [tx?.accountId]);
  const category = useLocal(async () => (tx?.categoryId ? store.get<Category>("categories", tx.categoryId) : null), [tx?.categoryId]);
  const [busy, setBusy] = useState(false);

  if (tx === undefined) return null;
  if (tx === null) return <Page header={false}><EmptyState icon="search-outline" title="Операция не найдена" text="Возможно, её удалили на другом устройстве." /></Page>;

  const changeCategory = async () => {
    const picked = await pickCategory(tx.type === "income" ? "income" : "expense");
    if (picked && picked !== tx.categoryId) await updateTransaction(store, tx.id, { categoryId: picked });
  };

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
        <ListItem icon="pricetag-outline" title={category?.name ?? "Без категории"} subtitle="Категория" onPress={() => void changeCategory()} testID="tx-category" />
        <ListItem icon="card-outline" title={account?.name ?? "Счёт"} subtitle="Счёт" onPress={account ? () => router.push(`/accounts/${account.id}`) : undefined} />
        {tx.note ? <ListItem icon="document-text-outline" title={tx.note} subtitle="Заметка" /> : null}
        <ListItem icon="information-circle-outline" title={SOURCE[tx.source] ?? tx.source} subtitle="Источник" />
      </Section>
      {tx.type !== "transfer" && <Button title="Удалить" variant="danger" icon="trash-outline" onPress={remove} busy={busy} testID="tx-delete" />}
    </Page>
  );
}
