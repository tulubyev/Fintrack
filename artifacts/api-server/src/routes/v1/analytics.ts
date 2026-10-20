import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { ApiError } from "../../lib/apiError";
import { cashflow, GROUP_BY, spending, type GroupBy } from "../../services/spendingAnalytics";
import { handle, queryList } from "./common";

/** Аналитика (E1.5-T2): /api/v1/analytics/spending, /cashflow. */
export const analyticsRouter = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DAYS = 3 * 366;

const invalid = (message: string) => new ApiError(400, "VALIDATION_ERROR", message);

function uuidList(value: unknown, name: string): string[] | undefined {
  const list = queryList(value);
  if (list?.some((item) => !UUID_RE.test(item))) throw invalid(`${name} — идентификаторы`);
  return list;
}

analyticsRouter.use(authenticateToken);

analyticsRouter.get("/spending", handle(async (req, res) => {
  const { from, to } = req.query;
  if (typeof from !== "string" || typeof to !== "string" || !DATE_RE.test(from) || !DATE_RE.test(to) || Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) {
    throw invalid("from и to — даты ГГГГ-ММ-ДД");
  }
  if (to < from) throw invalid("to раньше from");
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_DAYS) throw invalid("Период — не больше 3 лет");
  const groupBy = req.query.groupBy ?? "parent_category";
  if (typeof groupBy !== "string" || !(GROUP_BY as readonly string[]).includes(groupBy)) throw invalid(`groupBy — ${GROUP_BY.join(", ")}`);
  const type = req.query.type ?? "expense";
  if (type !== "expense" && type !== "income") throw invalid("type — expense или income");
  res.json(await spending(req.user.id, {
    from, to, groupBy: groupBy as GroupBy, type,
    accountIds: uuidList(req.query.accountId, "accountId"),
    categoryIds: uuidList(req.query.categoryId, "categoryId"),
  }));
}));

analyticsRouter.get("/cashflow", handle(async (req, res) => {
  const months = req.query.months === undefined ? 6 : Number(req.query.months);
  if (!Number.isInteger(months) || months < 1 || months > 24) throw invalid("months — от 1 до 24");
  res.json(await cashflow(req.user.id, months));
}));
