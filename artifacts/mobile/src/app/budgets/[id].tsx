import { useLocalSearchParams } from "expo-router";
import { formatDate } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal } from "@/data/hooks";
import type { Budget, Category } from "@/data/types";
import { Card, EmptyState, Label, Money, Page } from "@/ui/kit";

/** Бюджет (каркас T6): лимит и срок действия. Прогресс, темп трат и операции категории — T8. */
export default function BudgetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const budget = useLocal(() => store.get<Budget>("budgets", id), [id]);
  const category = useLocal(async () => (budget?.categoryId ? store.get<Category>("categories", budget.categoryId) : null), [budget?.categoryId]);

  if (budget === undefined) return null;
  if (budget === null) return <Page header={false}><EmptyState icon="search-outline" title="Бюджет не найден" /></Page>;

  return (
    <Page header={false}>
      <Card>
        <Label variant="heading">{budget.categoryId ? category?.name ?? "Категория" : "Общий бюджет"}</Label>
        <Money amount={budget.amount} size="title" />
        <Label variant="caption" tone="muted">
          С {formatDate(budget.effectiveFrom)}{budget.effectiveTo ? ` по ${formatDate(budget.effectiveTo)}` : ""}
        </Label>
      </Card>
      <EmptyState icon="stats-chart-outline" title="Прогресс бюджета появится в следующей версии" text="Пока его видно на сайте." />
    </Page>
  );
}
