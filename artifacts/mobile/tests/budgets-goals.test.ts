import { describe, expect, it } from "vitest";
import { monthBudgets } from "../src/data/budgets";
import { addMonths, forecast, goalProgress, monthsUntil } from "../src/data/goals";
import type { Category, Series } from "../src/data/types";
import { monthlyCost } from "../src/lib/recurring";

/** Те же случаи, что в серверных тестах (artifacts/api-server/tests/budgets.test.ts, goals.test.ts). */

const cat = (id: string, kind: string, parentId: string | null = null, name = id): Category =>
  ({ id, kind, parentId, name, icon: null, color: null, isSystem: true, hidden: false, sortOrder: 0 });
const categories = [
  cat("food", "expense", null, "Продукты"), cat("groceries", "expense", "food"), cat("eat", "expense"), cat("transport", "expense"),
  cat("home", "expense"), cat("salary", "income"),
];
const TODAY = "2026-10-17";
const THIS = "2026-10";
const tx = (amountRub: string, categoryId: string | null, extra: object = {}) =>
  ({ type: "expense" as const, date: TODAY, amountRub, categoryId, excludeFromStats: false, status: "posted", ...extra });
const budget = (id: string, categoryId: string | null, amount: string, extra: object = {}) =>
  ({ id, categoryId, amount, effectiveFrom: "2026-10-01", effectiveTo: null, rollover: false, excludedCategoryIds: [], ...extra });
const find = (list: ReturnType<typeof monthBudgets>, categoryId: string | null) => list.items.find((item) => item.categoryId === categoryId)!;

describe("бюджеты месяца", () => {
  it("пример из спецификации: −3 000, −2 000 в подкатегории, +500 возврат, перевод и исключённая — spent 4 500", () => {
    const list = monthBudgets([budget("b1", "food", "10000")], [
      tx("-3000.00", "food"),
      tx("-2000.00", "groceries"),
      tx("500.00", "food", { type: "income" }),
      tx("-4000.00", null, { type: "transfer" }),
      tx("-1000.00", "food", { excludeFromStats: true }),
    ], categories, THIS, TODAY);
    expect(find(list, "food")).toMatchObject({ spent: "4500.00", remaining: "5500.00", percent: 45, name: "Продукты" });
  });

  it("статус: больше лимита — over, от 80 % — warning; сортировка по проценту", () => {
    const list = monthBudgets([budget("b1", "eat", "1000"), budget("b2", "transport", "1000")],
      [tx("-1200.00", "eat"), tx("-850.00", "transport")], categories, THIS, "2026-10-31");
    expect(find(list, "eat")).toMatchObject({ status: "over", remaining: "-200.00" });
    expect(find(list, "transport").status).toBe("warning");
    expect(list.items.map((item) => item.categoryId)).toEqual(["eat", "transport"]);
  });

  it("warning, если траты обгоняют ожидаемое к сегодня, даже до 80 %", () => {
    const list = monthBudgets([budget("b1", "eat", "3100")], [tx("-500.00", "eat")], categories, THIS, "2026-10-02");
    expect(find(list, "eat")).toMatchObject({ expectedByToday: "200.00", status: "warning" });
  });

  it("подкатегория внутри родителя; общий с исключением; «без бюджета» с операциями без категории", () => {
    const list = monthBudgets([
      budget("b1", "food", "20000"), budget("b2", "groceries", "8000"), budget("b3", null, "80000", { excludedCategoryIds: ["home"] }),
    ], [tx("-5000.00", "groceries"), tx("-30000.00", "home"), tx("-700.00", "eat"), tx("-300.00", null)], categories, THIS, TODAY);
    expect(list.items[0].categoryId).toBeNull();
    expect(list.items[0].spent).toBe("6000.00");
    expect(find(list, "food").children).toHaveLength(1);
    expect(find(list, "food").children![0].spent).toBe("5000.00");
    expect(list.items.some((item) => item.categoryId === "groceries")).toBe(false);
    expect(list.total).toEqual({ amount: "80000.00", spent: "6000.00", remaining: "74000.00" });
    expect(list.unbudgetedSpent).toBe("31000.00");
  });

  it("перенос остатка: 25 000, в прошлом месяце потрачено 22 000 — в этом 28 000; перерасход лимит не уменьшает", () => {
    const prev = { effectiveFrom: "2026-09-01" };
    const list = monthBudgets([
      budget("b1", "eat", "25000", { ...prev, rollover: true }),
      budget("b2", "transport", "25000", prev),
      budget("b3", "home", "10000", { ...prev, rollover: true }),
    ], [
      tx("-22000.00", "eat", { date: "2026-09-10" }),
      tx("-22000.00", "transport", { date: "2026-09-10" }),
      tx("-15000.00", "home", { date: "2026-09-10" }),
    ], categories, THIS, TODAY);
    expect(find(list, "eat").effectiveAmount).toBe("28000.00");
    expect(find(list, "transport").effectiveAmount).toBe("25000.00");
    expect(find(list, "home").effectiveAmount).toBe("10000.00");
  });

  it("версии: закрытая в прошлом месяце не действует, будущая — ещё нет", () => {
    const list = monthBudgets([
      budget("old", "eat", "1000", { effectiveFrom: "2026-08-01", effectiveTo: "2026-09-30" }),
      budget("next", "transport", "1000", { effectiveFrom: "2026-11-01" }),
    ], [], categories, THIS, TODAY);
    expect(list.items).toEqual([]);
  });
});

describe("цели", () => {
  const rub = (value: number) => BigInt(value) * 100n;
  const base = { target: rub(150_000), current: rub(45_000), targetDate: "2027-04-19", today: "2026-10-19" };

  it("прогноз и нужный взнос — как на сервере", () => {
    expect(forecast({ ...base, growth: rub(15_000) })).toEqual({ forecastDate: "2027-05-19", monthlyNeeded: rub(17_500), onTrack: false });
    expect(forecast({ ...base, growth: rub(21_000) })).toMatchObject({ forecastDate: "2027-03-19", onTrack: true });
    expect(forecast({ ...base, growth: 0n })).toEqual({ forecastDate: null, monthlyNeeded: rub(17_500), onTrack: false });
    expect(forecast({ ...base, targetDate: null, growth: rub(1) })).toMatchObject({ monthlyNeeded: null, onTrack: null });
    expect(forecast({ ...base, current: rub(150_000), growth: 0n })).toEqual({ forecastDate: null, monthlyNeeded: null, onTrack: true });
    expect(forecast({ ...base, current: 0n, target: 100n * 100n + 1n, targetDate: "2026-11-19", growth: 0n }).monthlyNeeded).toBe(rub(101));
    expect(monthsUntil("2026-10-19", "2026-10-25")).toBe(1);
    expect(monthsUntil("2026-10-19", "2027-04-18")).toBe(5);
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
  });

  it("по взносам: сумма и прирост за 90 дней", () => {
    const today = "2026-10-19";
    const progress = goalProgress(
      { id: "g", targetAmount: "100000", targetDate: addMonths(today, 12), accountId: null, accountBaseline: null },
      {
        accounts: [],
        transactions: [],
        contributions: [
          { goalId: "g", amount: "5000.00", date: "2026-01-10" }, // давно — в сумме, не в приросте
          { goalId: "g", amount: "27000.00", date: "2026-09-01" },
          { goalId: "other", amount: "999.00", date: "2026-09-01" },
        ],
      },
      today,
    );
    expect(progress).toMatchObject({ currentAmount: "32000.00", percent: 32, avgMonthlyGrowth: "9000.00", forecastDate: addMonths(today, 8), onTrack: true, linked: false });
  });

  it("со счётом и «только новые деньги»: остаток минус база, прирост — операции счёта за 90 дней", () => {
    const today = "2026-10-19";
    const progress = goalProgress(
      { id: "g", targetAmount: "60000", targetDate: addMonths(today, 6), accountId: "acc", accountBaseline: "10000.00" },
      {
        accounts: [{ id: "acc", balance: "40000.00" }],
        contributions: [],
        transactions: [
          { accountId: "acc", amount: "30000.00", date: "2026-09-01" },
          { accountId: "acc", amount: "500.00", date: "2026-09-01", status: "pending" },
          { accountId: "other", amount: "9999.00", date: "2026-09-01" },
        ],
      },
      today,
    );
    expect(progress).toMatchObject({ currentAmount: "30000.00", percent: 50, avgMonthlyGrowth: "10000.00", forecastDate: addMonths(today, 3), onTrack: true, linked: true });
  });
});

describe("регулярные платежи", () => {
  it("стоимость в месяц: сумма × частота, только рублёвые списания", () => {
    const s = (periodicity: string, amount: string, extra: Partial<Series> = {}) =>
      ({ id: periodicity, displayName: "", direction: "out", amountLast: amount, expectedAmount: amount, currency: "RUB", kind: "subscription", accountId: null, categoryId: null, periodicity, nextExpectedDate: null, status: "confirmed", ...extra }) as Series;
    expect(monthlyCost([s("monthly", "300.00"), s("yearly", "1200.00"), s("weekly", "120.00")])).toBeCloseTo(300 + 100 + 520, 5);
    expect(monthlyCost([s("monthly", "100.00", { direction: "in" }), s("monthly", "10.00", { currency: "USD" })])).toBe(0);
  });
});
