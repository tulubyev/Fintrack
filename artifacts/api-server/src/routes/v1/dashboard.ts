import { Router } from "express";
import { authenticateToken } from "../../middleware/auth";
import { ApiError } from "../../lib/apiError";
import { track } from "../../services/analytics";
import { currentMonth, isMonth } from "../../services/budgetService";
import { dashboardSummary, dismissOnboarding } from "../../services/dashboardService";
import { handle } from "./common";

/** Главный экран (E1.5-T1): /api/v1/dashboard/summary, /onboarding/dismiss. */
export const dashboardRouter = Router();

dashboardRouter.use(authenticateToken);

dashboardRouter.get("/summary", handle(async (req, res) => {
  const month = req.query.month ?? currentMonth();
  if (typeof month !== "string" || !isMonth(month)) throw new ApiError(400, "VALIDATION_ERROR", "Месяц в формате ГГГГ-ММ");
  if (month > currentMonth()) throw new ApiError(400, "VALIDATION_ERROR", "Месяц ещё не наступил");
  res.json(await dashboardSummary(req.user.id, month));
}));

dashboardRouter.post("/onboarding/dismiss", handle(async (req, res) => {
  await dismissOnboarding(req.user.id);
  void track("onboarding_dismissed", { userId: req.user.id, props: {} });
  res.status(204).end();
}));
