import { router } from "expo-router";
import { formatDate } from "@workspace/shared/money";
import { transactionTitle, type Category, type Transaction } from "@/data/types";
import { ListItem, Money } from "./kit";

/** Строка операции в списках: получатель, категория и дата, сумма; нажатие — карточка операции. */
export function TransactionRow({ tx, category, showDate = true }: { tx: Transaction; category?: Category; showDate?: boolean }) {
  const subtitle = [category?.name ?? (tx.categoryId ? null : "Без категории"), showDate ? formatDate(tx.date) : null].filter(Boolean).join(" · ");
  return (
    <ListItem
      title={transactionTitle(tx)}
      subtitle={subtitle}
      value={<Money amount={tx.amount} currency={tx.currency} signed />}
      chevron={false}
      onPress={() => router.push(`/transactions/${tx.id}`)}
      testID={`tx-${tx.id}`}
    />
  );
}
