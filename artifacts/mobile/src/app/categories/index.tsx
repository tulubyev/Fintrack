import { useState } from "react";
import { router } from "expo-router";
import { store } from "@/data/device";
import { useLocal } from "@/data/hooks";
import { renameCategory, setCategoryHidden } from "@/data/mutations";
import type { Category } from "@/data/types";
import { Badge, Button, Field, Hint, ListItem, Page, Section, Sheet, Toggle } from "@/ui/kit";

/**
 * Категории (E2.1-T8): расходы и доходы с подкатегориями. Переключатель — показывать ли категорию в выборе (скрытая
 * остаётся у старых операций). Нажатие — переименовать: свою — по-настоящему, системную — только для себя.
 */
export default function Categories() {
  const categories = useLocal(() => store.list<Category>("categories"), []);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const byOrder = (a: Category, b: Category) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru");
  const children = (id: string) => (categories ?? []).filter((category) => category.parentId === id).sort(byOrder);
  const roots = (kind: string) => (categories ?? []).filter((category) => category.kind === kind && !category.parentId).sort(byOrder);

  const row = (category: Category, nested = false) => (
    <ListItem
      key={category.id}
      title={`${nested ? "   " : ""}${category.name}`}
      right={
        <>
          {!category.isSystem && <Badge text="своя" tone="primary" />}
          <Toggle
            value={!category.hidden}
            onValueChange={(visible) => void setCategoryHidden(store, category.id, !visible)}
            testID={`category-visible-${category.id}`}
          />
        </>
      }
      onPress={() => {
        setName(category.name);
        setEditing(category);
      }}
      chevron={false}
      testID={`category-row-${category.id}`}
    />
  );
  const group = (kind: string) => roots(kind).flatMap((root) => [row(root), ...children(root.id).map((child) => row(child, true))]);

  return (
    <Page header={false}>
      <Button title="Правила категорий" variant="link" onPress={() => router.push("/categories/rules")} />
      <Hint>Выключенная категория не предлагается при выборе; операции с ней не меняются.</Hint>
      <Section title="Расходы">{group("expense")}</Section>
      <Section title="Доходы">{group("income")}</Section>
      <Button title="Своя категория" variant="secondary" icon="add" onPress={() => router.push("/categories/new")} testID="category-add" />

      <Sheet visible={editing !== null} onClose={() => setEditing(null)} title={editing?.isSystem ? "Название для себя" : "Название категории"}>
        <Field label="Название" value={name} onChangeText={setName} autoFocus maxLength={60} testID="category-rename-input" />
        {editing?.isSystem && <Hint>Системная категория переименуется только у вас. Пустое поле — вернуть стандартное название.</Hint>}
        <Button
          title="Сохранить"
          disabled={!editing || (!editing.isSystem && !name.trim())}
          onPress={() => {
            if (editing) void renameCategory(store, editing.id, editing.isSystem, name.trim() || null);
            setEditing(null);
          }}
          testID="category-rename-save"
        />
      </Sheet>
    </Page>
  );
}
