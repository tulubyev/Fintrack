import { fromKopecks, toKopecks } from "@workspace/shared/money";
import type { Account, Goal, GoalContribution, Transaction } from "./types";

/**
 * Прогресс целей (E2.1-T8) по локальной базе — та же логика, что у сайта (services/goalService.ts):
 * - привязан счёт — накоплено = остаток счёта минус «база» (если считаем только новые деньги), не меньше нуля;
 *   иначе — сумма взносов;
 * - средний прирост в месяц = изменение за 90 дней / 3 (у счёта — сумма проведённых операций, у цели — взносы);
 * - прогноз: при приросте ≤ 0 — не будет достигнута; иначе сегодня + ⌈остаток / прирост⌉ месяцев;
 * - нужный взнос: остаток / месяцев до срока (не меньше одного), до рубля вверх.
 */

export const GROWTH_DAYS = 90;

export interface GoalProgress {
  id: string;
  currentAmount: string;
  percent: number;
  forecastDate: string | null;
  monthlyNeeded: string | null;
  avgMonthlyGrowth: string;
  /** null — срока нет, сравнивать не с чем. */
  onTrack: boolean | null;
  linked: boolean;
}

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

export function monthsUntil(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0));
}

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

export function forecast(input: { target: bigint; current: bigint; growth: bigint; targetDate: string | null; today: string }) {
  const left = input.target - input.current;
  const done = left <= 0n;
  const forecastDate = done || input.growth <= 0n ? null : addMonths(input.today, Number(ceilDiv(left, input.growth)));
  const monthlyNeeded = done || !input.targetDate ? null : ceilDiv(ceilDiv(left, BigInt(monthsUntil(input.today, input.targetDate))), 100n) * 100n;
  const onTrack = done ? true : !input.targetDate ? null : forecastDate !== null && forecastDate <= input.targetDate;
  return { forecastDate, monthlyNeeded, onTrack };
}

type Tx = Pick<Transaction, "accountId" | "amount" | "date"> & { status?: string };

export function goalProgress(
  goal: Pick<Goal, "id" | "targetAmount" | "targetDate" | "accountId" | "accountBaseline">,
  data: { accounts: Pick<Account, "id" | "balance">[]; contributions: Pick<GoalContribution, "goalId" | "amount" | "date">[]; transactions: Tx[] },
  today: string,
): GoalProgress {
  const target = toKopecks(goal.targetAmount);
  const account = goal.accountId ? data.accounts.find((item) => item.id === goal.accountId) : undefined;
  const since = addDays(today, -GROWTH_DAYS);
  let current: bigint;
  let delta = 0n;
  if (account) {
    const value = toKopecks(account.balance) - (goal.accountBaseline ? toKopecks(goal.accountBaseline) : 0n);
    current = value > 0n ? value : 0n;
    for (const tx of data.transactions) {
      if (tx.accountId === account.id && (tx.status ?? "posted") === "posted" && tx.date > since) delta += toKopecks(tx.amount);
    }
  } else {
    let total = 0n;
    for (const item of data.contributions) {
      if (item.goalId !== goal.id) continue;
      total += toKopecks(item.amount);
      if (item.date > since) delta += toKopecks(item.amount);
    }
    current = total > 0n ? total : 0n;
  }
  const growth = delta / 3n;
  const result = forecast({ target, current, growth, targetDate: goal.targetDate, today });
  return {
    id: goal.id,
    currentAmount: fromKopecks(current),
    percent: target > 0n ? Number((current * 100n) / target) : 0,
    forecastDate: result.forecastDate,
    monthlyNeeded: result.monthlyNeeded === null ? null : fromKopecks(result.monthlyNeeded),
    avgMonthlyGrowth: fromKopecks(growth),
    onTrack: result.onTrack,
    linked: Boolean(account),
  };
}
