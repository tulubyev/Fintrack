import { db } from "../db";
import { 
  bankConnections, accounts,
  type BankConnection, type InsertBankConnection, type Account, type InsertAccount
} from "@shared/schema";
import { eq, and, desc, sum } from "drizzle-orm";
import type { IBankStorage } from "./types";
import { protectBankTokens, revealBankTokens } from "../services/fieldEncryption";

export class BankStorage implements IBankStorage {
  async getBankConnections(userId: string): Promise<BankConnection[]> {
    const connections = await db.select().from(bankConnections).where(eq(bankConnections.userId, userId)).orderBy(desc(bankConnections.createdAt));
    return connections.map((connection) => revealBankTokens(connection));
  }

  async getBankConnection(id: string): Promise<BankConnection | undefined> {
    const [bankConnection] = await db.select().from(bankConnections).where(eq(bankConnections.id, id));
    return revealBankTokens(bankConnection || undefined);
  }

  async createBankConnection(connection: InsertBankConnection): Promise<BankConnection> {
    const [bankConnection] = await db.insert(bankConnections).values(protectBankTokens(connection)).returning();
    return revealBankTokens(bankConnection);
  }

  async updateBankConnection(id: string, updates: Partial<BankConnection>): Promise<BankConnection | undefined> {
    const [bankConnection] = await db.update(bankConnections).set(protectBankTokens(updates)).where(eq(bankConnections.id, id)).returning();
    return revealBankTokens(bankConnection || undefined);
  }

  async getAccounts(userId: string): Promise<Account[]> {
    return await db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)));
  }

  async getAccountsByBank(bankConnectionId: string): Promise<Account[]> {
    return await db.select().from(accounts).where(eq(accounts.bankConnectionId, bankConnectionId));
  }

  async createAccount(account: InsertAccount): Promise<Account> {
    const [newAccount] = await db.insert(accounts).values(account).returning();
    return newAccount;
  }

  async createOrUpdateAccount(account: InsertAccount): Promise<Account> {
    const [existingAccount] = await db.select().from(accounts).where(and(eq(accounts.externalAccountId, account.externalAccountId), eq(accounts.bankConnectionId, account.bankConnectionId)));
    if (existingAccount) {
      const [updatedAccount] = await db.update(accounts).set({ ...account, lastUpdatedAt: new Date() }).where(eq(accounts.id, existingAccount.id)).returning();
      return updatedAccount;
    } else {
      return this.createAccount(account);
    }
  }

  async updateAccount(id: string, updates: Partial<Account>): Promise<Account | undefined> {
    const [account] = await db.update(accounts).set({ ...updates, lastUpdatedAt: new Date() }).where(eq(accounts.id, id)).returning();
    return account || undefined;
  }

  async getTotalBalance(userId: string): Promise<string> {
    const result = await db.select({ total: sum(accounts.balance).as('total') }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)));
    return result[0]?.total || "0";
  }
}
