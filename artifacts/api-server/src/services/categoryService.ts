/**
 * Справочник категорий (E1.3): системное дерево (user_id = null) плюс категории пользователя
 * и его настройки системных (скрыть, переименовать).
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { budgets, categories, recurringSeries, transactions, userCategoryPrefs, type Category } from "@shared/schema";
import { db } from "../db";
import { ApiError } from "../lib/apiError";

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

// ---------- свои категории и настройки системных (E1.3-T2) ----------

const notFound = () => new ApiError(404, "NOT_FOUND", "Категория не найдена");

/** Видимая пользователю категория (системная или своя), без удалённых. Чужая неотличима от несуществующей. */
async function getVisible(executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string, id: string): Promise<Category> {
  const [row] = await executor.select().from(categories)
    .where(and(eq(categories.id, id), isNull(categories.deletedAt), or(isNull(categories.userId), eq(categories.userId, userId))));
  if (!row) throw notFound();
  return row;
}

async function nodeOf(userId: string, id: string): Promise<CategoryNode> {
  const tree = await listCategoryTree(userId, { includeHidden: true });
  for (const parent of tree) {
    if (parent.id === id) return parent;
    const child = parent.children.find((item) => item.id === id);
    if (child) return child;
  }
  throw notFound();
}

/** Имя занято среди видимых соседей (системных и своих) — без учёта регистра и переименований системных. */
async function assertNameFree(userId: string, parentId: string | null, name: string, exceptId?: string) {
  const siblings = await listCategoryTree(userId, { includeHidden: true });
  const pool = parentId ? siblings.find((node) => node.id === parentId)?.children ?? [] : siblings;
  if (pool.some((node) => node.id !== exceptId && node.name.toLocaleLowerCase("ru") === name.toLocaleLowerCase("ru"))) {
    throw new ApiError(409, "DUPLICATE_RESOURCE", "Категория с таким названием уже есть");
  }
}

/** Родитель — только верхнего уровня (категорий два уровня) и того же вида. */
async function checkParent(userId: string, parentId: string, kind: string): Promise<Category> {
  const parent = await getVisible(db, userId, parentId);
  if (parent.parentId) throw new ApiError(400, "VALIDATION_ERROR", "Категорий только два уровня: подкатегорию можно создать только у категории верхнего уровня");
  if (parent.kind !== kind) throw new ApiError(400, "VALIDATION_ERROR", "Вид категории должен совпадать с видом родителя");
  return parent;
}

export interface CategoryInput {
  id?: string;
  name: string;
  kind: "expense" | "income";
  parentId?: string | null;
  icon?: string | null;
  color?: string | null;
}

export async function createCategory(userId: string, input: CategoryInput): Promise<{ category: CategoryNode; created: boolean }> {
  if (input.id) {
    const [existing] = await db.select().from(categories).where(eq(categories.id, input.id));
    if (existing && existing.userId === userId && !existing.deletedAt) return { category: await nodeOf(userId, existing.id), created: false };
    if (existing) throw new ApiError(409, "DUPLICATE_RESOURCE", "Категория с таким id уже существует");
  }
  if (input.parentId) await checkParent(userId, input.parentId, input.kind);
  await assertNameFree(userId, input.parentId ?? null, input.name);
  const [row] = await db.insert(categories).values({
    id: input.id ?? randomUUID(),
    userId,
    parentId: input.parentId ?? null,
    name: input.name,
    kind: input.kind,
    icon: input.icon ?? null,
    color: input.color ?? null,
    sortOrder: 1000, // свои — после системных
  }).returning();
  return { category: await nodeOf(userId, row.id), created: true };
}

export interface CategoryPatch {
  name?: string;
  icon?: string | null;
  color?: string | null;
  parentId?: string | null;
  hidden?: boolean;
  customName?: string | null;
}

export async function updateCategory(userId: string, id: string, patch: CategoryPatch): Promise<CategoryNode> {
  const category = await getVisible(db, userId, id);
  if (category.userId === null) {
    // системную можно только скрыть или переименовать для себя: код, вид и место в дереве общие для всех
    if (patch.name !== undefined || patch.icon !== undefined || patch.color !== undefined || patch.parentId !== undefined) {
      throw new ApiError(403, "OPERATION_NOT_ALLOWED", "Системную категорию можно только скрыть или переименовать");
    }
    if (category.kind === "transfer" && patch.hidden) throw new ApiError(403, "OPERATION_NOT_ALLOWED", "Переводы между счетами скрыть нельзя");
    if (patch.customName) await assertNameFree(userId, category.parentId, patch.customName, id);
    await db.insert(userCategoryPrefs).values({
      userId, categoryId: id, hidden: patch.hidden ?? false, customName: patch.customName ?? null,
    }).onConflictDoUpdate({
      target: [userCategoryPrefs.userId, userCategoryPrefs.categoryId],
      set: {
        ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
        ...(patch.customName !== undefined ? { customName: patch.customName } : {}),
        updatedAt: new Date(),
      },
    });
    return nodeOf(userId, id);
  }

  if (patch.hidden !== undefined || patch.customName !== undefined) {
    throw new ApiError(400, "VALIDATION_ERROR", "Свою категорию можно переименовать или удалить, скрытие — только у системных");
  }
  const parentId = patch.parentId === undefined ? category.parentId : patch.parentId;
  if (patch.parentId !== undefined && patch.parentId !== null) {
    if (patch.parentId === id) throw new ApiError(400, "VALIDATION_ERROR", "Категория не может быть родителем сама себе");
    await checkParent(userId, patch.parentId, category.kind);
    const [child] = await db.select({ id: categories.id }).from(categories).where(and(eq(categories.parentId, id), isNull(categories.deletedAt))).limit(1);
    if (child) throw new ApiError(400, "VALIDATION_ERROR", "У категории есть подкатегории — её нельзя сделать подкатегорией");
  }
  if (patch.name !== undefined || patch.parentId !== undefined) await assertNameFree(userId, parentId, patch.name ?? category.name, id);
  await db.update(categories).set({
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.parentId !== undefined ? { parentId: patch.parentId } : {}),
    updatedAt: new Date(),
  }).where(eq(categories.id, id));
  return nodeOf(userId, id);
}

/**
 * Удалить свою категорию (и её подкатегории) с переносом операций, бюджетов и регулярных платежей в замену.
 * Если у замены уже есть бюджет, бюджеты удаляемой категории удаляются, а не сливаются: два лимита на одну категорию
 * сервис бюджетов не допускает.
 */
export async function deleteCategory(userId: string, id: string, replaceWithId: string) {
  return db.transaction(async (tx) => {
    const category = await getVisible(tx, userId, id);
    if (category.userId === null) throw new ApiError(403, "OPERATION_NOT_ALLOWED", "Системную категорию можно только скрыть");
    const replacement = await getVisible(tx, userId, replaceWithId);
    const children = await tx.select({ id: categories.id }).from(categories)
      .where(and(eq(categories.parentId, id), isNull(categories.deletedAt)));
    const removed = [id, ...children.map((child) => child.id)];
    if (removed.includes(replacement.id)) throw new ApiError(400, "VALIDATION_ERROR", "Замена не может быть удаляемой категорией или её подкатегорией");
    if (replacement.kind !== category.kind) throw new ApiError(400, "VALIDATION_ERROR", "Замена должна быть того же вида: расходы, доходы или переводы");

    const moved = await tx.update(transactions).set({ categoryId: replacement.id, updatedAt: new Date() })
      .where(and(eq(transactions.userId, userId), inArray(transactions.categoryId, removed))).returning({ id: transactions.id });

    const [replacementBudget] = await tx.select({ id: budgets.id }).from(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.categoryId, replacement.id), isNull(budgets.deletedAt))).limit(1);
    const affectedBudgets = replacementBudget
      ? await tx.update(budgets).set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(budgets.userId, userId), inArray(budgets.categoryId, removed), isNull(budgets.deletedAt))).returning({ id: budgets.id })
      : await tx.update(budgets).set({ categoryId: replacement.id, updatedAt: new Date() })
        .where(and(eq(budgets.userId, userId), inArray(budgets.categoryId, removed), isNull(budgets.deletedAt))).returning({ id: budgets.id });
    // исключения общего бюджета не должны ссылаться на удалённую категорию
    for (const removedId of removed) {
      await tx.update(budgets).set({ excludedCategoryIds: sql`array_remove(${budgets.excludedCategoryIds}, ${removedId}::uuid)` })
        .where(and(eq(budgets.userId, userId), sql`${removedId}::uuid = any(${budgets.excludedCategoryIds})`));
    }
    await tx.update(recurringSeries).set({ categoryId: replacement.id, updatedAt: new Date() })
      .where(and(eq(recurringSeries.userId, userId), inArray(recurringSeries.categoryId, removed)));

    await tx.update(categories).set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(inArray(categories.id, removed), eq(categories.userId, userId), ne(categories.id, replacement.id)));
    return { movedTransactions: moved.length, movedRules: 0, movedBudgets: replacementBudget ? 0 : affectedBudgets.length, removedBudgets: replacementBudget ? affectedBudgets.length : 0 };
  });
}
