import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../middleware/auth";
import { ApiError, sendValidationError } from "../lib/apiError";
import { track } from "../services/analytics";
import { CATEGORY_KINDS, createCategory, deleteCategory, listCategoryTree, updateCategory } from "../services/categoryService";
import { eq } from "drizzle-orm";
import { db, users } from "@workspace/db";
import { llmCategorizationEnabled } from "../services/categorization/llm";
import { handle, pathId } from "./v1/common";

/** Категории (E1.3-T1/T2): GET /api/v1/categories — дерево; POST, PATCH /:id, DELETE /:id — свои и настройки системных. */
const router = Router();

const querySchema = z.object({
  kind: z.enum(CATEGORY_KINDS).optional(),
  includeHidden: z.enum(["true", "false"]).optional().transform((value) => value === "true"),
});
const name = z.string().trim().min(1, "Введите название").max(60);
const icon = z.string().regex(/^[a-z0-9-]{1,40}$/, "Значок — имя из набора").nullable();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Цвет в формате #RRGGBB").nullable();

const createSchema = z.object({
  id: z.string().uuid().optional(),
  name,
  kind: z.enum(["expense", "income"], { errorMap: () => ({ message: "Свою категорию можно создать для расходов или доходов" }) }),
  parentId: z.string().uuid().nullable().optional(),
  icon: icon.optional(),
  color: color.optional(),
}).strict();

const patchSchema = z.object({
  name: name.optional(),
  icon: icon.optional(),
  color: color.optional(),
  parentId: z.string().uuid().nullable().optional(),
  hidden: z.boolean().optional(),
  customName: name.nullable().optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, "Нечего менять");

const deleteSchema = z.object({ replaceWithId: z.string().uuid({ message: "Выберите категорию, куда перенести операции" }) });

const categoryId = (req: Parameters<typeof pathId>[0]) => pathId(req, "Категория не найдена");

router.use(authenticateToken);

router.get("/", handle(async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error, "Некорректные параметры");
  res.json({ items: await listCategoryTree(req.user.id, parsed.data) });
}));

router.post("/", handle(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { category, created } = await createCategory(req.user.id, parsed.data);
  if (created) void track("category_created", { userId: req.user.id, props: { kind: category.kind, has_parent: Boolean(parsed.data.parentId) } });
  res.status(created ? 201 : 200).json(category);
}));

// «Использовать нейросеть для категорий» (E1.3-T8); llmAvailable — включена ли нейросеть на сервере
const settingsSchema = z.object({ llm: z.boolean() }).strict();
const settingsOf = async (userId: string) => {
  const [user] = await db.select({ llm: users.llmCategorization }).from(users).where(eq(users.id, userId));
  return { llm: user?.llm ?? true, llmAvailable: llmCategorizationEnabled() };
};

router.get("/settings", handle(async (req, res) => {
  res.json(await settingsOf(req.user.id));
}));

router.patch("/settings", handle(async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  await db.update(users).set({ llmCategorization: parsed.data.llm }).where(eq(users.id, req.user.id));
  res.json(await settingsOf(req.user.id));
}));

router.patch("/:id", handle(async (req, res) => {
  const id = categoryId(req);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await updateCategory(req.user.id, id, parsed.data));
}));

router.delete("/:id", handle(async (req, res) => {
  const id = categoryId(req);
  const parsed = deleteSchema.safeParse({ replaceWithId: req.body?.replaceWithId ?? req.query.replaceWithId });
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  res.json(await deleteCategory(req.user.id, id, parsed.data.replaceWithId));
}));

export default router;
