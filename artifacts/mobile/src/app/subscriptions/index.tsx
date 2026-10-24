import { router } from "expo-router";
import { formatDate } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal, useRefresh } from "@/data/hooks";
import type { Series } from "@/data/types";
import { monthlyCost, PERIOD_LABEL } from "@/lib/recurring";
import { Card, EmptyState, Label, ListItem, Money, Page, Section } from "@/ui/kit";

/**
 * Подписки и регулярные платежи (E2.1-T8): найденные автоматически ждут подтверждения, подтверждённые — с ближайшей датой.
 * Сколько всё это стоит в месяц. Решения («подписка», «не подписка», «отменил») — в карточке.
 */
export default function Subscriptions() {
  const refresh = useRefresh();
  const series = useLocal(() => store.list<Series>("recurring"), []);
  const byDate = (a: Series, b: Series) => (a.nextExpectedDate ?? "9999").localeCompare(b.nextExpectedDate ?? "9999");
  const detected = (series ?? []).filter((item) => item.status === "detected").sort(byDate);
  const confirmed = (series ?? []).filter((item) => item.status === "confirmed").sort(byDate);
  const row = (item: Series) => (
    <ListItem
      key={item.id}
      icon={item.direction === "in" ? "arrow-down-outline" : "repeat-outline"}
      title={item.displayName}
      subtitle={[PERIOD_LABEL[item.periodicity ?? ""], item.nextExpectedDate ? `следующий ${formatDate(item.nextExpectedDate)}` : null].filter(Boolean).join(" · ") || undefined}
      value={<Money amount={item.expectedAmount ?? item.amountLast} currency={item.currency} />}
      onPress={() => router.push(`/subscriptions/${item.id}`)}
      testID={`series-${item.id}`}
    />
  );
  const cost = monthlyCost([...detected, ...confirmed]);

  return (
    <Page header={false} {...refresh}>
      {series !== undefined && !detected.length && !confirmed.length ? (
        <EmptyState icon="repeat-outline" title="Регулярных платежей не найдено" text="Они находятся по повторяющимся операциям — загрузите выписку за 2–3 месяца." />
      ) : (
        <>
          {cost > 0 && (
            <Card>
              <Label variant="caption" tone="muted">Регулярные списания в месяц</Label>
              <Money amount={cost.toFixed(2)} size="title" testID="subscriptions-monthly" />
            </Card>
          )}
          {detected.length > 0 && <Section title="Нужно подтвердить">{detected.map(row)}</Section>}
          {confirmed.length > 0 && <Section title="Подтверждённые">{confirmed.map(row)}</Section>}
        </>
      )}
    </Page>
  );
}
