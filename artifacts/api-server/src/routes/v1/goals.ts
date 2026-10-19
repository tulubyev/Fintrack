import { Router } from "express";
import { z } from "zod";
import { authenticateToken } from "../../middleware/auth";
import { ApiError, sendValidationError } from "../../lib/apiError";
import { toKopecks } from "../../lib/money";
import { track } from "../../services/analytics";
import {
  addContribution, createGoal, deleteContribution, deleteGoal, getGoal, listContributions, listGoals, setGoalArchived, todayMsk, updateGoal,
} from "../../services/goalService";
import { handle, isoDate, money, pathId, positiveMoney } from "./common";

/** Цели v2 (E1.4-T5): /api/v1/goals, /:id, /:id/archive, /:id/unarchive, /:id/contributions. */
export const goalsRouter = Router();

const futureDate = isoDate.refine((value) => value >= todayMsk(), "Срок — сегодня или позже");
const nonZeroMoney = money.refine((value) => toKopecks(value) !== 0n, "Сумма не может быть нулевой");
const icon = z.string().regex(/^[a-z0-9-]{1,40}$/, "Значок — имя из набора");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Цвет в формате #RRGGBB");
const description = z.string().trim().max(500);

const createSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Введите название").max(100),
  targetAmount: positiveMoney,
  targetDate: futureDate.nullable().optional(),
  accountId: z.string().uuid().nullable().optional(),
  countOnlyNewMoney: z.boolean().optional(),
  initialAmount: money.refine((value) => toKopecks(value) >= 0n, "Сумма не может быть отрицательной").optional(),
  icon: icon.nullable().optional(),
  color: color.nullable().optional(),
  description: description.nullable().optional(),
}).strict();

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100),
  targetAmount: positiveMoney,
  targetDate: futureDate.nullable(),
  accountId: z.string().uuid().nullable(),
  countOnlyNewMoney: z.boolean(),
  icon: icon.nullable(),
  color: color.nullable(),
  description: description.nullable(),
}).partial().strict().refine((patch) => Object.keys(patch).length > 0, "Нечего менять");

const contributionSchema = z.object({
  id: z.string().uuid().optional(),
  amount: nonZeroMoney,
  date: isoDate.optional(),
  note: z.string().trim().max(200).nullable().optional(),
  transactionId: z.string().uuid().nullable().optional(),
}).strict();

/** Сумма корзинами — без точных денег в аналитике */
function amountBucket(amount: string): string {
  const rubles = Number(toKopecks(amount) / 100n);
  if (rubles < 0) return "withdrawal";
  if (rubles < 10_000) return "<10k";
  if (rubles < 50_000) return "10k-50k";
  if (rubles < 200_000) return "50k-200k";
  if (rubles < 1_000_000) return "200k-1m";
  return "1m+";
}

const goalId = (req: Parameters<typeof pathId>[0]) => pathId(req, "Цель не найдена");

goalsRouter.use(authenticateToken);

goalsRouter.get("/", handle(async (req, res) => {
  res.json({ items: await listGoals(req.user.id, req.query.includeArchived === "true") });
}));

goalsRouter.post("/", handle(async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { goal, created } = await createGoal(req.user.id, parsed.data);
  if (created) {
    void track("goal_created", { userId: req.user.id, props: {
      has_target_date: Boolean(parsed.data.targetDate), linked_account: Boolean(parsed.data.accountId), amount_bucket: amountBucket(parsed.data.targetAmount),
    } });
  }
  res.status(created ? 201 : 200).json(goal);
}));

goalsRouter.get("/:id", handle(async (req, res) => {
  res.json(await getGoal(req.user.id, goalId(req)));
}));

goalsRouter.patch("/:id", handle(async (req, res) => {
  const id = goalId(req);
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  res.json(await updateGoal(req.user.id, id, parsed.data));
}));

goalsRouter.post("/:id/archive", handle(async (req, res) => {
  res.json(await setGoalArchived(req.user.id, goalId(req), true));
}));

goalsRouter.post("/:id/unarchive", handle(async (req, res) => {
  res.json(await setGoalArchived(req.user.id, goalId(req), false));
}));

goalsRouter.delete("/:id", handle(async (req, res) => {
  await deleteGoal(req.user.id, goalId(req));
  res.status(204).end();
}));

goalsRouter.get("/:id/contributions", handle(async (req, res) => {
  const id = goalId(req);
  const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ApiError(400, "VALIDATION_ERROR", "limit — от 1 до 100");
  const cursor = typeof req.query.cursor === "string" && req.query.cursor ? req.query.cursor : undefined;
  res.json(await listContributions(req.user.id, id, { limit, cursor }));
}));

goalsRouter.post("/:id/contributions", handle(async (req, res) => {
  const id = goalId(req);
  const parsed = contributionSchema.safeParse(req.body);
  if (!parsed.success) return sendValidationError(res, parsed.error);
  const { contribution, goal, created } = await addContribution(req.user.id, id, parsed.data);
  if (created) void track("goal_contribution_added", { userId: req.user.id, props: { amount_bucket: amountBucket(parsed.data.amount), via: "manual" } });
  res.status(created ? 201 : 200).json({ contribution, goal });
}));

goalsRouter.delete("/:id/contributions/:cid", handle(async (req, res) => {
  const id = goalId(req);
  const cid = pathId(req, "Взнос не найден", "cid");
  await deleteContribution(req.user.id, id, cid);
  res.status(204).end();
}));
