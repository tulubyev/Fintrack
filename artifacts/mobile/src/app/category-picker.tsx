import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { store } from "@/data/device";
import { useLocal } from "@/data/hooks";
import type { Category } from "@/data/types";
import { resolveCategoryPick } from "@/lib/picker";
import { EmptyState, ListItem, Page, Section } from "@/ui/kit";

/** Выбор категории (pickCategory): родительские — разделами, подкатегории — строками; скрытые не показываем. */
export default function CategoryPicker() {
  const { kind } = useLocalSearchParams<{ kind?: string }>();
  const categories = useLocal(() => store.list<Category>("categories"), []);
  useEffect(() => () => resolveCategoryPick(null), []); // закрыли жестом «назад»

  const visible = (categories ?? []).filter((category) => !category.hidden && (!kind || category.kind === kind));
  const byOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru");
  const parents = visible.filter((category) => !category.parentId).sort(byOrder);

  const choose = (id: string) => {
    resolveCategoryPick(id);
    router.back();
  };

  return (
    <Page header={false}>
      {categories !== undefined && !visible.length && <EmptyState title="Категорий нет" text="Они появятся после синхронизации." />}
      {parents.map((parent) => {
        const children = visible.filter((category) => category.parentId === parent.id).sort(byOrder);
        return (
          <Section key={parent.id} title={parent.name}>
            <ListItem title={children.length ? `${parent.name} — всё` : parent.name} onPress={() => choose(parent.id)} chevron={false} testID={`category-${parent.id}`} />
            {children.map((child) => (
              <ListItem key={child.id} title={child.name} onPress={() => choose(child.id)} chevron={false} testID={`category-${child.id}`} />
            ))}
          </Section>
        );
      })}
    </Page>
  );
}
