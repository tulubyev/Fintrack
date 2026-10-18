/**
 * Справочник категорий (E1.3): системное дерево (user_id = null) плюс категории пользователя
 * и его настройки системных (скрыть, переименовать).
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { categories, userCategoryPrefs, type Category } from "@shared/schema";
import { db } from "../db";

export const CATEGORY_KINDS = ["expense", "income", "transfer"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export interface CategoryNode {
  id: string;
  code: string | null;
  name: string;
  kind: string;
  icon: string | null;
  color: string | null;
  taxDeduction: string | null;
  isSystem: boolean;
  hidden: boolean;
  children: CategoryNode[];
}

const bySortThenName = (a: { sortOrder: number; name: string }, b: { sortOrder: number; name: string }) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru");

/** Дерево категорий, видимых пользователю: системные и его собственные. Скрытые — только с includeHidden. */
export async function listCategoryTree(userId: string, options: { kind?: CategoryKind; includeHidden?: boolean } = {}): Promise<CategoryNode[]> {
  const rows = await db
    .select({ category: categories, hidden: userCategoryPrefs.hidden, customName: userCategoryPrefs.customName })
    .from(categories)
    .leftJoin(userCategoryPrefs, and(eq(userCategoryPrefs.categoryId, categories.id), eq(userCategoryPrefs.userId, userId)))
    .where(and(
      or(isNull(categories.userId), eq(categories.userId, userId)),
      isNull(categories.deletedAt),
      options.kind ? eq(categories.kind, options.kind) : undefined,
    ));

  const toNode = (category: Category, hidden: boolean | null, customName: string | null) => ({
    sortOrder: category.sortOrder,
    parentId: category.parentId,
    node: {
      id: category.id,
      code: category.code,
      name: customName ?? category.name,
      kind: category.kind,
      icon: category.icon,
      color: category.color,
      taxDeduction: category.taxDeduction,
      isSystem: category.userId === null,
      hidden: hidden ?? false,
      children: [],
    } as CategoryNode,
  });

  const entries = rows
    .map((row) => toNode(row.category, row.hidden, row.customName))
    .filter((entry) => options.includeHidden || !entry.node.hidden);

  const sortTree = (parentId: string | null): CategoryNode[] =>
    entries
      .filter((entry) => entry.parentId === parentId)
      .sort((a, b) => bySortThenName({ sortOrder: a.sortOrder, name: a.node.name }, { sortOrder: b.sortOrder, name: b.node.name }))
      .map((entry) => ({ ...entry.node, children: sortTree(entry.node.id) }));

  // Обход идёт от корней, поэтому подкатегории скрытого родителя в ответ не попадают
  return sortTree(null);
}
