import { router } from "expo-router";
import { todayIso } from "@workspace/shared/money";
import { store } from "@/data/device";
import { useLocal, useLookup, useRefresh } from "@/data/hooks";
import type { Budget, Category } from "@/data/types";
import { EmptyState, ListItem, Money, Page, Section } from "@/ui/kit";

/** Бюджеты (каркас T6): действующие лимиты из локальной базы. Прогресс, темп и прогноз — T8. */
export default function Budgets() {
  const refresh = useRefresh();
  const budgets = useLocal(() => store.list<Budget>("budgets"), []);
  const categories = useLookup<Category>("categories");
  const today = todayIso();
  const current = (budgets ?? []).filter((budget) => budget.effectiveFrom <= today && (!budget.effectiveTo || budget.effectiveTo >= today));

  return (
    <Page title="Бюджеты" {...refresh}>
      {budgets !== undefined && current.length === 0 ? (
        <EmptyState icon="pie-chart-outline" title="Бюджетов пока нет" text="Задайте лимиты на сайте — они появятся здесь после синхронизации." />
      ) : (
        <Section>
          {current.map((budget) => (
            <ListItem
              key={budget.id}
              icon={budget.categoryId ? "pricetag-outline" : "wallet-outline"}
              title={budget.categoryId ? categories.get(budget.categoryId)?.name ?? "Категория" : "Общий бюджет"}
              subtitle={budget.period === "month" ? "в месяц" : budget.period}
              value={<Money amount={budget.amount} />}
              onPress={() => router.push(`/budgets/${budget.id}`)}
              testID={`budget-${budget.id}`}
            />
          ))}
        </Section>
      )}
    </Page>
  );
}
