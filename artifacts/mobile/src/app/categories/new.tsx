import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { newId, store } from "@/data/device";
import { useLocal } from "@/data/hooks";
import { createCategory } from "@/data/mutations";
import type { Category } from "@/data/types";
import { Button, Chip, Field, Hint, Label, Page } from "@/ui/kit";

/** Своя категория (E2.1-T8): название, расход или доход, родитель — если это подкатегория. */
export default function NewCategory() {
  const categories = useLocal(() => store.list<Category>("categories"), []);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [parentId, setParentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const parents = (categories ?? []).filter((category) => category.kind === kind && !category.parentId && !category.hidden);

  const save = async () => {
    const value = name.trim();
    if (!value) return setError("Введите название");
    const taken = (categories ?? []).some((category) => category.kind === kind && category.parentId === parentId && category.name.toLocaleLowerCase("ru") === value.toLocaleLowerCase("ru"));
    if (taken) return setError("Такая категория уже есть");
    await createCategory(store, newId(), { name: value, kind, parentId });
    router.back();
  };

  return (
    <Page header={false}>
      <Field label="Название" value={name} onChangeText={setName} placeholder="Хобби" autoFocus maxLength={60} testID="category-name" />
      <View style={styles.chips}>
        <Chip label="Расход" selected={kind === "expense"} onPress={() => { setKind("expense"); setParentId(null); }} />
        <Chip label="Доход" selected={kind === "income"} onPress={() => { setKind("income"); setParentId(null); }} />
      </View>
      <View style={styles.block}>
        <Label variant="caption" tone="muted">Внутри категории (необязательно)</Label>
        <View style={styles.chips}>
          <Chip label="Отдельная" selected={parentId === null} onPress={() => setParentId(null)} />
          {parents.map((parent) => <Chip key={parent.id} label={parent.name} selected={parentId === parent.id} onPress={() => setParentId(parent.id)} />)}
        </View>
      </View>
      {error && <Hint tone="danger">{error}</Hint>}
      <Button title="Создать" onPress={() => void save()} testID="category-save" />
    </Page>
  );
}

const styles = StyleSheet.create({
  block: { gap: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
