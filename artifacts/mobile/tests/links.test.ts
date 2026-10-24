import { describe, expect, it } from "vitest";
import { toAppPath } from "../src/lib/links";

describe("ссылки в приложение", () => {
  it("схема приложения fintrack://", () => {
    expect(toAppPath("fintrack://budgets/1")).toBe("/budgets/1");
    expect(toAppPath("fintrack:///transactions/abc?from=push")).toBe("/transactions/abc?from=push");
    expect(toAppPath("fintrack://")).toBe("/");
  });

  it("App Links: https://fin-wall.ru/app/… → путь экрана, /app — главная", () => {
    expect(toAppPath("https://fin-wall.ru/app/budgets/1")).toBe("/budgets/1");
    expect(toAppPath("https://www.fin-wall.ru/app/accounts/42?x=1")).toBe("/accounts/42?x=1");
    expect(toAppPath("https://fin-wall.ru/app")).toBe("/");
    expect(toAppPath("https://FIN-WALL.RU/app/goals")).toBe("/goals");
    // путь сайта без /app — тот же путь экрана
    expect(toAppPath("https://fin-wall.ru/subscriptions")).toBe("/subscriptions");
  });

  it("чужой домен открывает главную", () => {
    expect(toAppPath("https://evil.example/app/settings")).toBe("/");
    expect(toAppPath("https://fin-wall.ru.evil.example/app/settings")).toBe("/");
  });

  it("deepLink уведомления — путь сайта как есть; Expo Go при разработке", () => {
    expect(toAppPath("/budgets/7")).toBe("/budgets/7");
    expect(toAppPath("/app/transactions")).toBe("/transactions");
    expect(toAppPath("/application")).toBe("/application"); // не префикс /app
    expect(toAppPath("exp://192.168.1.10:8081/--/categories/rules")).toBe("/categories/rules");
    expect(toAppPath("exp://192.168.1.10:8081")).toBe("/");
    expect(toAppPath("//budgets//1")).toBe("/budgets/1");
  });
});
