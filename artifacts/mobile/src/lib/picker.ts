import { router } from "expo-router";

/**
 * Выбор категории с любого экрана: const id = await pickCategory("expense").
 * Открывает /category-picker; null — закрыли без выбора. Одновременно открыт один выбор.
 */
let pending: ((id: string | null) => void) | null = null;

export function pickCategory(kind?: "expense" | "income"): Promise<string | null> {
  pending?.(null);
  return new Promise((resolve) => {
    pending = resolve;
    router.push({ pathname: "/category-picker", params: kind ? { kind } : {} });
  });
}

/** Экран выбора: id — выбрали, null — закрыли. */
export function resolveCategoryPick(id: string | null): void {
  pending?.(id);
  pending = null;
}
