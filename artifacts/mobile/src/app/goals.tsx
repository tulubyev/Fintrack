import { formatDate } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal, useRefresh } from "@/data/hooks";
import type { Goal } from "@/data/types";
import { Badge, EmptyState, ListItem, Money, Page, Section } from "@/ui/kit";

/** Цели (каркас T6): список целей. Прогресс, взносы и прогноз — T8. */
export default function Goals() {
  const refresh = useRefresh();
  const goals = useLocal(() => store.list<Goal>("goals"), []);
  const active = (goals ?? []).filter((goal) => !goal.archivedAt);
  return (
    <Page header={false} {...refresh}>
      {goals !== undefined && !active.length && <EmptyState icon="flag-outline" title="Целей пока нет" text="Создайте цель на сайте — она появится после синхронизации." />}
      {active.length > 0 && (
        <Section>
          {active.map((goal) => (
            <ListItem
              key={goal.id}
              icon="flag-outline"
              title={goal.name}
              subtitle={goal.targetDate ? `к ${formatDate(goal.targetDate)}` : undefined}
              value={<Money amount={goal.targetAmount} />}
              right={goal.completedAt ? <Badge text="достигнута" tone="success" /> : undefined}
            />
          ))}
        </Section>
      )}
    </Page>
  );
}
