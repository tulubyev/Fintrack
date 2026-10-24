import { router } from "expo-router";
import { formatDate } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal, useRefresh } from "@/data/hooks";
import type { Series } from "@/data/types";
import { EmptyState, ListItem, Money, Page, Section } from "@/ui/kit";

/** Подписки и регулярные платежи (каркас T6): активные серии и ближайшее списание. Управление — T8. */
export default function Subscriptions() {
  const refresh = useRefresh();
  const series = useLocal(() => store.list<Series>("recurring"), []);
  const active = (series ?? []).filter((item) => item.status === "detected" || item.status === "confirmed").sort((a, b) => (a.nextExpectedDate ?? "9999").localeCompare(b.nextExpectedDate ?? "9999"));
  return (
    <Page header={false} {...refresh}>
      {series !== undefined && !active.length && <EmptyState icon="repeat-outline" title="Регулярных платежей не найдено" text="Они определяются по операциям — найдите их на сайте в «Подписках»." />}
      {active.length > 0 && (
        <Section>
          {active.map((item) => (
            <ListItem
              key={item.id}
              icon={item.direction === "in" ? "arrow-down-outline" : "repeat-outline"}
              title={item.displayName}
              subtitle={item.nextExpectedDate ? `следующий ${formatDate(item.nextExpectedDate)}` : undefined}
              value={<Money amount={item.amountLast} currency={item.currency} />}
              onPress={() => router.push(`/subscriptions/${item.id}`)}
              testID={`series-${item.id}`}
            />
          ))}
        </Section>
      )}
    </Page>
  );
}
