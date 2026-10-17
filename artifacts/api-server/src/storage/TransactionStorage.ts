import { db } from "../db";
import { 
  transactions, savingsGoals, budgets,
  type Transaction, type InsertTransaction, type SavingsGoal, type InsertSavingsGoal,
  type Budget, type InsertBudget
} from "@shared/schema";
import { eq, and, desc, gte, lt, lte, sql } from "drizzle-orm";
import type { ITransactionStorage } from "./types";

export class TransactionStorage implements ITransactionStorage {
  async getTransactions(userId: string, limit = 50): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.transactionDate)).limit(limit);
  }

  async getTransactionsByAccount(accountId: string, limit = 50): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.accountId, accountId)).orderBy(desc(transactions.transactionDate)).limit(limit);
  }

  async getTransactionsByCategory(userId: string, category: string, fromDate?: Date, toDate?: Date): Promise<Transaction[]> {
    const conditions = [eq(transactions.userId, userId), eq(transactions.category, category)];
    if (fromDate && toDate) {
      conditions.push(gte(transactions.transactionDate, fromDate), lte(transactions.transactionDate, toDate));
    }
    return await db.select().from(transactions).where(and(...conditions)).orderBy(desc(transactions.transactionDate));
  }

  /** Доходы (положительные суммы) и расходы (модуль отрицательных) за период [from, to). */
  async getCashFlow(userId: string, from: Date, to: Date): Promise<{ income: string; expenses: string }> {
    const [row] = await db.select({
      income: sql<string>`coalesce(sum(${transactions.amount}) FILTER (WHERE ${transactions.amount} > 0), 0)::text`,
      expenses: sql<string>`coalesce(-sum(${transactions.amount}) FILTER (WHERE ${transactions.amount} < 0), 0)::text`,
    }).from(transactions).where(and(
      eq(transactions.userId, userId),
      gte(transactions.transactionDate, from),
      lt(transactions.transactionDate, to),
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
    return await db.select().from(savingsGoals).where(and(eq(savingsGoals.userId, userId), eq(savingsGoals.isActive, true))).orderBy(desc(savingsGoals.createdAt));
  }

  async createSavingsGoal(goal: InsertSavingsGoal): Promise<SavingsGoal> {
    const [savingsGoal] = await db.insert(savingsGoals).values(goal).returning();
    return savingsGoal;
  }

  async updateSavingsGoal(id: string, userId: string, updates: Partial<SavingsGoal>): Promise<SavingsGoal | undefined> {
    const [savingsGoal] = await db.update(savingsGoals).set({ ...updates, updatedAt: new Date() }).where(and(eq(savingsGoals.id, id), eq(savingsGoals.userId, userId))).returning();
    return savingsGoal || undefined;
  }

  async getBudgets(userId: string, month: number, year: number): Promise<Budget[]> {
    return await db.select().from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.month, month), eq(budgets.year, year), eq(budgets.isActive, true)));
  }

  async createBudget(budget: InsertBudget): Promise<Budget> {
    const [newBudget] = await db.insert(budgets).values(budget).returning();
    return newBudget;
  }

  async updateBudget(id: string, updates: Partial<Budget>): Promise<Budget | undefined> {
    const [budget] = await db.update(budgets).set(updates).where(eq(budgets.id, id)).returning();
    return budget || undefined;
  }
}
