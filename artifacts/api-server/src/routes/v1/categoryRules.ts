import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { authenticateToken } from "../../middleware/auth";
import { sendValidationError } from "../../lib/apiError";
import { track } from "../../services/analytics";
import { createRule, deleteRule, listRules, previewRule, updateRule } from "../../services/categorization/rules";
import { toDtos } from "../../services/transactionService";
import { handle, money, pathId } from "./common";

/** Правила категоризации пользователя (E1.3-T7): /api/v1/category-rules. */
export const categoryRulesRouter = Router();
categoryRulesRouter.use(authenticateToken);

const condition = {
  field: z.enum(["merchant", "description", "mcc"]),
  op: z.enum(["equals", "contains", "starts_with"]),
  pattern: z.string().trim().min(1).max(200),
  accountId: z.string().uuid().nullable().optional(),
  direction: z.enum(["in", "out"]).nullable().optional(),
};
const ruleFields = {
  ...condition,
  categoryId: z.string().uuid(),
  amountMin: money.nullable().optional(),
  amountMax: money.nullable().optional(),
  renameMerchantTo: z.string().trim().max(120).nullable().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
};
const apply = z.enum(["future", "future_and_past"]).default("future");
const createSchema = z.object({ ...ruleFields, apply }).strict();
const patchSchema = z.object({ ...ruleFields, apply }).partial().strict();
const previewSchema = z.object(condition).strict();
const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50), cursor: z.string().max(40).optional() });

const notFound = "Правило не найдено";

categoryRulesRouter.get("/", handle(async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await listRules(req.user.id, parsed.data));
}));

categoryRulesRouter.post("/preview", handle(async (req, res) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { matchCount, sample } = await previewRule(req.user.id, parsed.data);
  res.json({ matchCount, sample: await toDtos(db, sample) });
}));

categoryRulesRouter.post("/", handle(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { apply: scope, ...input } = parsed.data;
  const result = await createRule(req.user.id, input, "manual", scope);
  void track("category_rule_created", { userId: req.user.id, props: { source: "manual", field: input.field } });
  res.status(201).json(result);
}));

categoryRulesRouter.patch("/:id", handle(async (req, res) => {
  const id = pathId(req, notFound);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { apply: scope, ...patch } = parsed.data;
  const { rule, affectedCount } = await updateRule(req.user.id, id, patch, scope);
  res.json({ ...rule, affectedCount });
}));

categoryRulesRouter.delete("/:id", handle(async (req, res) => {
  await deleteRule(req.user.id, pathId(req, notFound));
  res.status(204).end();
}));
