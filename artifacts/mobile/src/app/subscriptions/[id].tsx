import { useLocalSearchParams } from "expo-router";
import { formatDate } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal, useLookup } from "@/data/hooks";
import { setSeriesStatus } from "@/data/mutations";
import type { Category, Series, Transaction } from "@/data/types";
import { TransactionRow } from "@/ui/TransactionRow";
import { Badge, Button, Card, EmptyState, Hint, Label, Money, Page, Section } from "@/ui/kit";
import { PERIOD_LABEL } from "@/lib/recurring";

const STATUS: Record<string, string> = { detected: "найден автоматически", confirmed: "подтверждён", ignored: "не подписка", cancelled: "отменён", ended: "закончился" };

/**
 * Регулярный платёж (E2.1-T8): сумма, частота, следующая дата, история списаний (операции серии); решения:
 * подтвердить, «это не подписка», «отменил подписку» — как на сайте.
 */
export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const series = useLocal(() => store.get<Series>("recurring", id), [id]);
  const history = useLocal(() => store.list<Transaction>("transactions", { fields: { recurringSeriesId: id }, limit: 24 }), [id]);
  const categories = useLookup<Category>("categories");
  if (series === undefined) return null;
  if (series === null) return <Page header={false}><EmptyState icon="search-outline" title="Платёж не найден" /></Page>;
  const open = series.status === "detected" || series.status === "confirmed";

  return (
    <Page header={false}>
      <Card>
        <Label variant="heading">{series.displayName}</Label>
        <Money amount={series.expectedAmount ?? series.amountLast} currency={series.currency} size="title" />
        <Label variant="caption" tone="muted">
          {[PERIOD_LABEL[series.periodicity ?? ""], series.nextExpectedDate && open ? `следующий ${formatDate(series.nextExpectedDate)}` : null].filter(Boolean).join(" · ")}
        </Label>
        <Badge text={STATUS[series.status] ?? series.status} tone={series.status === "confirmed" ? "success" : "muted"} />
      </Card>

      {series.status === "detected" && (
        <>
          <Hint>Похоже на регулярный платёж. Подтвердите — он попадёт в ближайшие списания на главной.</Hint>
          <Button title="Да, это подписка" icon="checkmark" onPress={() => void setSeriesStatus(store, id, "confirmed")} testID="series-confirm" />
          <Button title="Нет, это не подписка" variant="secondary" onPress={() => void setSeriesStatus(store, id, "ignored")} testID="series-ignore" />
        </>
      )}
      {series.status === "confirmed" && (
        <Button title="Я отменил подписку" variant="secondary" icon="close-circle-outline" onPress={() => void setSeriesStatus(store, id, "cancelled")} testID="series-cancel" />
      )}
      {!open && (
        <Button title="Вернуть в подтверждённые" variant="secondary" onPress={() => void setSeriesStatus(store, id, "confirmed")} testID="series-restore" />
      )}

      {history && history.length > 0 && (
        <Section title="Списания">
          {history.map((tx) => <TransactionRow key={tx.id} tx={tx} category={tx.categoryId ? categories.get(tx.categoryId) : undefined} />)}
        </Section>
      )}
    </Page>
  );
}
