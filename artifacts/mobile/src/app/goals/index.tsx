import { router } from "expo-router";
import { useRefresh } from "@/data/hooks";
import { useGoals } from "@/data/useGoals";
import { GoalRow } from "@/ui/GoalRow";
import { Button, EmptyState, Page, Section } from "@/ui/kit";

/** Цели (E2.1-T8): прогресс, прогноз и нужный взнос — как на сайте (data/goals.ts); архив — отдельным разделом. */
export default function Goals() {
  const refresh = useRefresh();
  const goals = useGoals();
  const active = (goals ?? []).filter((goal) => !goal.archivedAt);
  const archived = (goals ?? []).filter((goal) => goal.archivedAt);
  return (
    <Page header={false} {...refresh}>
      {goals !== undefined && !active.length && (
        <EmptyState icon="flag-outline" title="Целей пока нет" text="Отпуск, подушка безопасности, новый телефон — поставьте цель и пополняйте её." />
      )}
      {active.length > 0 && <Section>{active.map((goal) => <GoalRow key={goal.id} goal={goal} />)}</Section>}
      <Button title="Новая цель" variant="secondary" icon="add" onPress={() => router.push("/goals/new")} testID="goal-add" />
      {archived.length > 0 && <Section title="Архив">{archived.map((goal) => <GoalRow key={goal.id} goal={goal} />)}</Section>}
    </Page>
  );
}
