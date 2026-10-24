import { store } from "@/data/device";
import { useLocal, useLookup } from "@/data/hooks";
import type { Category, Rule } from "@/data/types";
import { EmptyState, ListItem, Page, Section } from "@/ui/kit";

const FIELD: Record<string, string> = { merchant: "Получатель", description: "Описание", mcc: "MCC" };

/** Правила категорий (каркас T6): «если получатель содержит … → категория». Создание и правка — T8. */
export default function Rules() {
  const rules = useLocal(() => store.list<Rule>("rules"), []);
  const categories = useLookup<Category>("categories");
  if (rules !== undefined && !rules.length) {
    return <Page header={false}><EmptyState icon="git-branch-outline" title="Правил пока нет" text="Правило появляется, когда вы меняете категорию и выбираете «эта и будущие»." /></Page>;
  }
  return (
    <Page header={false}>
      <Section>
        {(rules ?? []).map((rule) => (
          <ListItem
            key={rule.id}
            title={`${FIELD[rule.field] ?? rule.field}: ${rule.pattern}`}
            subtitle={`→ ${categories.get(rule.categoryId)?.name ?? "категория"}${rule.hitCount ? ` · сработало ${rule.hitCount}` : ""}`}
          />
        ))}
      </Section>
    </Page>
  );
}
