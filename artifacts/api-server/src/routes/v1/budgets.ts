import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../../middleware/auth";
import { ApiError, sendValidationError } from "../../lib/apiError";
import { track } from "../../services/analytics";
import {
  budgetDaily, createBudget, createBudgets, currentMonth, deleteBudget, isMonth, listBudgets, suggestBudgets, updateBudget,
} from "../../services/budgetService";
import { handle, pathId, positiveMoney } from "./common";

/** Бюджеты v2 (E1.4-T2): /api/v1/budgets, /suggestions, /bulk, /:id, /:id/daily (график, E1.4-T4). */
export const budgetsRouter = Router();

const month = z.string().refine(isMonth, "Месяц в формате ГГГГ-ММ");
const thresholds = z.array(z.number().int().min(1).max(200)).min(1).max(5)
  .transform((values) => [...new Set(values)].sort((a, b) => a - b));

const createSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid().nullable(),
  amount: positiveMoney,
  rollover: z.boolean().optional(),
  fromMonth: month.optional(),
  excludedCategoryIds: z.array(z.string().uuid()).max(50).optional(),
  alertThresholds: thresholds.optional(),
}).strict();

const patchSchema = z.object({
  amount: positiveMoney,
  rollover: z.boolean(),
  alertThresholds: thresholds,
  excludedCategoryIds: z.array(z.string().uuid()).max(50),
  fromMonth: month,
}).partial().strict().refine((patch) => Object.keys(patch).some((key) => key !== "fromMonth"), "Нечего менять");

const bulkSchema = z.object({
  items: z.array(z.object({ categoryId: z.string().uuid(), amount: positiveMoney }).strict()).min(1).max(20),
  fromMonth: month.optional(),
}).strict();

const parseMonth = (value: unknown) => {
  if (value === undefined) return currentMonth();
  if (typeof value !== "string" || !isMonth(value)) throw new ApiError(400, "VALIDATION_ERROR", "Месяц в формате ГГГГ-ММ");
  return value;
};

const budgetId = (req: Parameters<typeof pathId>[0]) => pathId(req, "Бюджет не найден");

budgetsRouter.use(authenticateToken);

budgetsRouter.get("/", handle(async (req, res) => {
  res.json(await listBudgets(req.user.id, parseMonth(req.query.month)));
}));

budgetsRouter.get("/suggestions", handle(async (req, res) => {
  const suggestions = await suggestBudgets(req.user.id);
  if (suggestions.length) void track("budget_suggestions_shown", { userId: req.user.id, props: { count: suggestions.length } });
  res.json(suggestions);
}));

budgetsRouter.get("/:id/daily", handle(async (req, res) => {
  res.json(await budgetDaily(req.user.id, budgetId(req), parseMonth(req.query.month)));
}));

budgetsRouter.post("/bulk", handle(async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const created = await createBudgets(req.user.id, parsed.data.items, parsed.data.fromMonth);
  created.forEach(() => void track("budget_created", { userId: req.user.id, props: { is_total: false, from_suggestion: true, rollover: false } }));
  res.status(201).json({ created });
}));

budgetsRouter.post("/", handle(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { status, created } = await createBudget(req.user.id, parsed.data);
  if (created) {
    void track("budget_created", { userId: req.user.id, props: {
      is_total: parsed.data.categoryId === null, from_suggestion: false, rollover: parsed.data.rollover ?? false,
    } });
  }
  res.status(created ? 201 : 200).json(status);
}));

budgetsRouter.patch("/:id", handle(async (req, res) => {
  const id = budgetId(req);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const status = await updateBudget(req.user.id, id, parsed.data);
  void track("budget_updated", { userId: req.user.id, props: { fields: Object.keys(parsed.data).filter((key) => key !== "fromMonth").sort().join(",") } });
  res.json(status);
}));

budgetsRouter.delete("/:id", handle(async (req, res) => {
  const id = budgetId(req);
  await deleteBudget(req.user.id, id, parseMonth(req.query.fromMonth));
  res.status(204).end();
}));
