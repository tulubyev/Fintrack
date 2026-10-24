import { Alert } from "react-native";
import { store } from "@/data/device";
import { useLocal, useLookup } from "@/data/hooks";
import { deleteRule } from "@/data/mutations";
import type { Category, Rule } from "@/data/types";
import { SwipeRow } from "@/ui/SwipeRow";
import { EmptyState, Hint, ListItem, Page, Section } from "@/ui/kit";

const FIELD: Record<string, string> = { merchant: "Получатель", description: "Описание", mcc: "MCC" };
const OP: Record<string, string> = { equals: "=", contains: "содержит", starts_with: "начинается с" };

/**
 * Правила категорий (E2.1-T8): «если получатель содержит … → категория». Появляются при смене категории
 * с «эта и будущие»; удаляются свайпом. Новые операции правило больше не трогает, прошлые остаются как есть.
 */
export default function Rules() {
  const rules = useLocal(() => store.list<Rule>("rules"), []);
  const categories = useLookup<Category>("categories");
  if (rules !== undefined && !rules.length) {
    return <Page header={false}><EmptyState icon="git-branch-outline" title="Правил пока нет" text="Правило появляется, когда вы меняете категорию и выбираете «эта и будущие»." /></Page>;
  }
  const remove = (rule: Rule) =>
    Alert.alert("Удалить правило?", "Уже размеченные операции не изменятся.", [
      { text: "Отмена", style: "cancel" },
      { text: "Удалить", style: "destructive", onPress: () => void deleteRule(store, rule.id) },
    ]);
  return (
    <Page header={false}>
      <Hint>Свайп влево — удалить правило.</Hint>
      <Section>
        {(rules ?? []).map((rule) => (
          <SwipeRow key={rule.id} right={{ label: "Удалить", icon: "trash-outline", tone: "danger", onPress: () => remove(rule), testID: `rule-delete-${rule.id}` }}>
            <ListItem
              title={`${FIELD[rule.field] ?? rule.field} ${OP[rule.op] ?? rule.op} «${rule.pattern}»`}
              subtitle={`→ ${categories.get(rule.categoryId)?.name ?? "категория"}${rule.hitCount ? ` · сработало ${rule.hitCount}` : ""}`}
            />
          </SwipeRow>
        ))}
      </Section>
    </Page>
  );
}
