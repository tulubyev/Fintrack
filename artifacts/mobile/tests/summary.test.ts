import { describe, expect, it } from "vitest";
import { addDays, monthSummary, upcomingPayments } from "../src/data/summary";
import type { Category, Series } from "../src/data/types";

const cat = (id: string, kind: string, parentId: string | null = null): Category =>
  ({ id, kind, parentId, name: id, icon: null, color: null, isSystem: true, hidden: false, sortOrder: 0 });

const categories = [cat("food", "expense"), cat("cafe", "expense", "food"), cat("transport", "expense"), cat("salary", "income")];
const tx = (date: string, type: string, amountRub: string, categoryId: string | null, extra: object = {}) =>
  ({ date, type: type as "expense", amountRub, categoryId, excludeFromStats: false, status: "posted", ...extra });

describe("сводка главной", () => {
  it("траты и доходы месяца, возвраты уменьшают траты, переводы и исключённые не считаются", () => {
    const summary = monthSummary([
      tx("2026-10-02", "expense", "-1000.00", "cafe"),
      tx("2026-10-03", "expense", "-500.00", "transport"),
      tx("2026-10-04", "income", "200.00", "food"), // возврат в кафе-родителе
      tx("2026-10-05", "income", "50000.00", "salary"),
      tx("2026-10-06", "transfer", "-3000.00", null),
      tx("2026-10-07", "expense", "-700.00", "transport", { excludeFromStats: true }),
      tx("2026-10-08", "expense", "-100.00", null),
      tx("2026-10-25", "expense", "-999.00", "transport"), // после сегодняшнего дня
    ], categories, "2026-10-17");
    expect(summary).toMatchObject({ income: "50000.00", expense: "1400.00", net: "48600.00", from: "2026-10-01", to: "2026-10-17" });
    expect(summary.top.map((item) => [item.name, item.amount])).toEqual([["food", "800.00"], ["transport", "500.00"], ["Без категории", "100.00"]]);
    expect(summary.top[0].share).toBeCloseTo(800 / 1400, 3);
    expect(summary.uncategorized).toBe(1); // расход без категории; перевод без категории не в счёт
  });

  it("сравнение с тем же периодом прошлого месяца, в коротком месяце — до его конца", () => {
    const summary = monthSummary([
      tx("2026-03-02", "expense", "-1500.00", "transport"),
      tx("2026-02-10", "expense", "-1000.00", "transport"),
      tx("2026-02-28", "expense", "-1000.00", "transport"), // 28 февраля ≤ 31-го по «тот же период»
    ], categories, "2026-03-31");
    expect(summary.expensePrevSamePeriod).toBe("2000.00");
    expect(summary.expenseDeltaPct).toBe(-25);
    expect(summary.top[0].deltaPct).toBe(-25);

    const early = monthSummary([tx("2026-10-02", "expense", "-100.00", null), tx("2026-09-20", "expense", "-100.00", null)], categories, "2026-10-05");
    expect(early.expensePrevSamePeriod).toBe("0.00");
    expect(early.expenseDeltaPct).toBeNull();
  });

  it("больше пяти категорий — «Остальное»", () => {
    const many = Array.from({ length: 7 }, (_, i) => cat(`c${i}`, "expense"));
    const summary = monthSummary(many.map((c, i) => tx("2026-10-01", "expense", `-${(i + 1) * 100}.00`, c.id)), many, "2026-10-01");
    expect(summary.top).toHaveLength(5);
    expect(summary.other).toEqual({ amount: "300.00", share: expect.any(Number) });
  });

  it("ближайшие списания: 14 дней, шаг периодичности, без отменённых и доходов", () => {
    const series = (id: string, nextExpectedDate: string, periodicity: string, extra: Partial<Series> = {}): Series =>
      ({ id, displayName: id, direction: "out", amountLast: "100.00", expectedAmount: "100.00", currency: "RUB", periodicity, nextExpectedDate, status: "confirmed", ...extra });
    const items = upcomingPayments([
      series("music", "2026-10-20", "monthly"),
      series("gym", "2026-10-10", "weekly"), // прошла — следующие 24 и 31 октября
      series("old", "2026-10-25", "monthly", { status: "cancelled" }),
      series("salary", "2026-10-21", "monthly", { direction: "in" }),
      series("far", "2026-11-15", "monthly"),
    ], "2026-10-18");
    expect(items.map((item) => `${item.name} ${item.date}`)).toEqual(["music 2026-10-20", "gym 2026-10-24", "gym 2026-10-31"]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});
