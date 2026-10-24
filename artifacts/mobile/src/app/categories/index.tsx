import { router } from "expo-router";
import { store } from "@/data/device";
import { useLocal } from "@/data/hooks";
import type { Category } from "@/data/types";
import { Badge, Button, ListItem, Page, Section } from "@/ui/kit";

/** Категории (каркас T6): расходы и доходы с подкатегориями. Свои категории и скрытие — T8. */
export default function Categories() {
  const categories = useLocal(() => store.list<Category>("categories"), []);
  const byOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru");
  const group = (kind: string) => (categories ?? []).filter((category) => category.kind === kind && !category.parentId).sort(byOrder);
  const childCount = (id: string) => (categories ?? []).filter((category) => category.parentId === id).length;
  const row = (category: Category) => (
    <ListItem
      key={category.id}
      title={category.name}
      subtitle={childCount(category.id) ? `подкатегорий: ${childCount(category.id)}` : undefined}
      right={category.hidden ? <Badge text="скрыта" /> : !category.isSystem ? <Badge text="своя" tone="primary" /> : undefined}
    />
  );
  return (
    <Page header={false}>
      <Button title="Правила категорий" variant="link" onPress={() => router.push("/categories/rules")} />
      <Section title="Расходы">{group("expense").map(row)}</Section>
      <Section title="Доходы">{group("income").map(row)}</Section>
    </Page>
  );
}
