import { describe, expect, it } from "vitest";
import { frequentCategories } from "../src/data/summary";
import { applyAmountKey, displayAmount, fromApiAmount, toApiAmount, type AmountKey } from "../src/lib/amountInput";
import { dayTitle, periodRange } from "../src/lib/dates";

const type = (keys: string) => [...keys].reduce((value, key) => applyAmountKey(value, (key === "<" ? "back" : key) as AmountKey), "");

describe("цифровая клавиатура суммы", () => {
  it("цифры, запятая, два знака после запятой, без ведущих нулей", () => {
    expect(type("1500")).toBe("1500");
    expect(type("007")).toBe("7");
    expect(type(",5")).toBe("0,5");
    expect(type("12,345")).toBe("12,34");
    expect(type("1,,2")).toBe("1,2");
    expect(type("12345678901")).toBe("1234567890");
    expect(type("12<<<")).toBe("");
  });

  it("в формат API и обратно, показ с разрядами", () => {
    expect(toApiAmount("1234,5")).toBe("1234.50");
    expect(toApiAmount("150")).toBe("150.00");
    expect(toApiAmount("0,")).toBeNull();
    expect(toApiAmount("")).toBeNull();
    expect(displayAmount("1234567,8")).toBe("1 234 567,8");
    expect(fromApiAmount("-150.00")).toBe("150");
    expect(fromApiAmount("150.50")).toBe("150,5");
  });
});

describe("даты и частые категории", () => {
  it("заголовки дней и периоды ленты", () => {
    expect(dayTitle("2026-10-24", "2026-10-24")).toBe("Сегодня");
    expect(dayTitle("2026-10-23", "2026-10-24")).toBe("Вчера");
    expect(periodRange("month", "2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange("prev", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(periodRange("3m", "2026-03-10")).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(periodRange("all")).toEqual({});
  });

  it("частые категории — по типу, за 90 дней, по убыванию", () => {
    const rows = [
      { type: "expense" as const, categoryId: "cafe", date: "2026-10-01" },
      { type: "expense" as const, categoryId: "cafe", date: "2026-10-02" },
      { type: "expense" as const, categoryId: "taxi", date: "2026-10-03" },
      { type: "expense" as const, categoryId: "old", date: "2026-06-01" },
      { type: "income" as const, categoryId: "salary", date: "2026-10-05" },
      { type: "expense" as const, categoryId: null, date: "2026-10-05" },
    ];
    expect(frequentCategories(rows, "expense", "2026-10-24")).toEqual(["cafe", "taxi"]);
    expect(frequentCategories(rows, "income", "2026-10-24")).toEqual(["salary"]);
  });
});
