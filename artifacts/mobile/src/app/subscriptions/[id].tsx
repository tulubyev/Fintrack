import { useLocalSearchParams } from "expo-router";
import { formatDate } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal } from "@/data/hooks";
import type { Series } from "@/data/types";
import { Card, EmptyState, Label, Money, Page } from "@/ui/kit";

/** Регулярный платёж (каркас T6): сумма и следующая дата. История и отмена — T8. */
export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const series = useLocal(() => store.get<Series>("recurring", id), [id]);
  if (series === undefined) return null;
  if (series === null) return <Page header={false}><EmptyState icon="search-outline" title="Платёж не найден" /></Page>;
  return (
    <Page header={false}>
      <Card>
        <Label variant="heading">{series.displayName}</Label>
        <Money amount={series.amountLast} currency={series.currency} size="title" />
        {series.nextExpectedDate && <Label variant="caption" tone="muted">Следующий платёж — {formatDate(series.nextExpectedDate)}</Label>}
      </Card>
    </Page>
  );
}
