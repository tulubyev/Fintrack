import { todayIso } from "@workspace/shared/money";
import { store } from "./device";
import { goalProgress, GROWTH_DAYS, type GoalProgress } from "./goals";
import { useLocal } from "./hooks";
import type { Account, Goal, GoalContribution, Transaction } from "./types";

export type GoalWithProgress = Goal & { progress: GoalProgress };

/** Цели с прогрессом и прогнозом (data/goals.ts); включая архивные — экран сам решает, что показать. */
export function useGoals(): GoalWithProgress[] | undefined {
  return useLocal(async () => {
    const today = todayIso();
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - GROWTH_DAYS * 86_400_000).toISOString().slice(0, 10);
    const goals = await store.list<Goal>("goals");
    const accountIds = [...new Set(goals.map((goal) => goal.accountId).filter((id): id is string => Boolean(id)))];
    const [accounts, contributions, transactions] = await Promise.all([
      store.list<Account>("accounts"),
      store.list<GoalContribution>("goalContributions"),
      accountIds.length ? store.list<Transaction>("transactions", { accountIds, from: since }) : Promise.resolve([]),
    ]);
    return goals.map((goal) => ({ ...goal, progress: goalProgress(goal, { accounts, contributions, transactions }, today) }));
  }, []);
}
