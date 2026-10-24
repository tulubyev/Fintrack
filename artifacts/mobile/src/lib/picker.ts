import { router } from "expo-router";

/**
 * Выбор категории с любого экрана: const id = await pickCategory({ kind: "expense" }).
 * id — выбрали; null — выбрали «Без категории» (только с allowNone); undefined — закрыли без выбора.
 * Одновременно открыт один выбор.
 */
let pending: ((id: string | null | undefined) => void) | null = null;

export function pickCategory(options: { kind?: "expense" | "income"; allowNone?: boolean } = {}): Promise<string | null | undefined> {
  pending?.(undefined);
  return new Promise((resolve) => {
    pending = resolve;
    const params: Record<string, string> = {};
    if (options.kind) params.kind = options.kind;
    if (options.allowNone) params.allowNone = "1";
    router.push({ pathname: "/category-picker", params });
  });
}

/** Экран выбора: id или null («Без категории») — выбрали, undefined — закрыли. */
export function resolveCategoryPick(id: string | null | undefined): void {
  pending?.(id);
  pending = null;
}
