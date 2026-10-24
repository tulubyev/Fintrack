import { todayIso } from "@workspace/shared/money";
import { budgetsFromDate, monthBudgets, type MonthBudgets } from "./budgets";
import { store } from "./device";
import { useLocal } from "./hooks";
import type { Budget, Category, Transaction } from "./types";

/** Бюджеты месяца из локальной базы (data/budgets.ts); операции — с запасом на перенос остатка за год. */
export function useMonthBudgets(month: string): MonthBudgets | undefined {
  return useLocal(async () => {
    const [budgets, transactions, categories] = await Promise.all([
      store.list<Budget>("budgets"),
      // «-31» как верхняя граница строкой подходит любому месяцу: даты сравниваются как YYYY-MM-DD
      store.list<Transaction>("transactions", { from: budgetsFromDate(month), to: `${month}-31`, types: ["expense", "income"] }),
      store.list<Category>("categories"),
    ]);
    return monthBudgets(budgets, transactions, categories, month, todayIso());
  }, [month]);
}
