import { db } from "../db";
import { 
  transactions, savingsGoals,
  type Transaction, type InsertTransaction, type SavingsGoal,
} from "@shared/schema";
import { eq, and, desc, gte, lt, sql, isNull } from "drizzle-orm";
import type { ITransactionStorage } from "./types";
import { FEED_ORDER } from "../services/transactionService";
import { expenseFilterSql, incomeFilterSql } from "../services/categorization/refund";

export class TransactionStorage implements ITransactionStorage {
  async getTransactions(userId: string, limit = 50): Promise<Transaction[]> {
    return await db.select().from(transactions)
      .where(and(eq(transactions.userId, userId), isNull(transactions.deletedAt)))
      .orderBy(...FEED_ORDER)
      .limit(limit);
  }

  async getTransactionsByAccount(accountId: string, limit = 50): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.accountId, accountId)).orderBy(desc(transactions.transactionDate)).limit(limit);
  }

  /**
   * Доходы и расходы за период [from, to) по local_date в рублях (amount_rub). Переводы, корректировки,
   * удалённые и исключённые из статистики операции не считаются. Возврат (доход в категории расходов) уменьшает расходы.
   */
  async getCashFlow(userId: string, from: Date, to: Date): Promise<{ income: string; expenses: string }> {
    const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const [row] = await db.select({
      income: sql<string>`coalesce(sum(${transactions.amountRub}) FILTER (WHERE ${incomeFilterSql}), 0)::text`,
      expenses: sql<string>`coalesce(-sum(${transactions.amountRub}) FILTER (WHERE ${expenseFilterSql}), 0)::text`,
    }).from(transactions).where(and(
      eq(transactions.userId, userId),
      isNull(transactions.deletedAt),
      eq(transactions.excludeFromStats, false),
      eq(transactions.status, "posted"),
      gte(transactions.localDate, ymd(from)),
      lt(transactions.localDate, ymd(to)),
    ));
    return row ?? { income: "0", expenses: "0" };
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [newTransaction] = await db.insert(transactions).values(transaction).returning();
    return newTransaction;
  }

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined> {
    const [transaction] = await db.update(transactions).set(updates).where(eq(transactions.id, id)).returning();
    return transaction || undefined;
  }

  async getSavingsGoals(userId: string): Promise<SavingsGoal[]> {
    // цели v2: не в архиве и не удалены; current_amount — кеш, его обновляет goalService
    return await db.select().from(savingsGoals).where(and(eq(savingsGoals.userId, userId), isNull(savingsGoals.archivedAt), isNull(savingsGoals.deletedAt))).orderBy(desc(savingsGoals.createdAt));
  }

}
