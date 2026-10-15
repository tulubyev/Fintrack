import { db } from "../db";
import { 
  adminLogs, users, documents, bankConnections, accounts, transactions,
  type AdminLog, type InsertAdminLog, type User
} from "@shared/schema";
import { eq, desc, sql, or, gte, lte, and } from "drizzle-orm";
import type { IAdminStorage } from "./types";

export class AdminStorage implements IAdminStorage {
  async createAdminLog(log: InsertAdminLog): Promise<AdminLog> {
    const [adminLog] = await db.insert(adminLogs).values(log).returning();
    return adminLog;
  }

  // adminUserId не задан — логи всех администраторов (super_admin)
  async getAdminLogs(adminUserId?: string, options?: { limit?: number; page?: number }): Promise<AdminLog[]> {
    const base = db.select().from(adminLogs);
    const filtered = adminUserId ? base.where(eq(adminLogs.adminUserId, adminUserId)) : base;
    const ordered = filtered.orderBy(desc(adminLogs.createdAt));
    if (options?.limit) {
      const offset = options.page && options.page > 1 ? (options.page - 1) * options.limit : 0;
      return await ordered.limit(options.limit).offset(offset);
    }
    return await ordered;
  }

  async getAdminStats(): Promise<any> {
    const [userStats] = await db.select({
      totalUsers: sql<number>`count(*)::int`,
      verifiedUsers: sql<number>`count(*) FILTER (WHERE is_verified = true)::int`,
      newUsersToday: sql<number>`count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int`,
    }).from(users);
    const [connectionStats] = await db.select({
      totalConnections: sql<number>`count(*)::int`,
      activeConnections: sql<number>`count(*) FILTER (WHERE status = 'active')::int`,
    }).from(bankConnections);
    const pendingDocuments = await this.getPendingDocumentsCount();
    return { ...userStats, ...connectionStats, pendingDocuments, timestamp: new Date().toISOString() };
  }

  async getUserAnalytics(): Promise<any> {
    const byPlan = await db.select({ planType: users.planType, count: sql<number>`count(*)::int` }).from(users).groupBy(users.planType);
    const byRole = await db.select({ role: users.role, count: sql<number>`count(*)::int` }).from(users).groupBy(users.role);
    const registrations = await db.select({
      date: sql<string>`to_char(date_trunc('day', created_at), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    }).from(users).where(sql`created_at >= now() - interval '30 days'`).groupBy(sql`date_trunc('day', created_at)`).orderBy(sql`date_trunc('day', created_at)`);
    return { byPlan, byRole, registrationsLast30Days: registrations, timestamp: new Date().toISOString() };
  }

  async getFinancialOverview(): Promise<any> {
    const balances = await db.select({
      currency: accounts.currency,
      accounts: sql<number>`count(*)::int`,
      totalBalance: sql<string>`coalesce(sum(balance), 0)::text`,
    }).from(accounts).where(eq(accounts.isActive, true)).groupBy(accounts.currency);
    const [flow] = await db.select({
      transactions: sql<number>`count(*)::int`,
      income: sql<string>`coalesce(sum(amount) FILTER (WHERE amount > 0), 0)::text`,
      expenses: sql<string>`coalesce(sum(amount) FILTER (WHERE amount < 0), 0)::text`,
    }).from(transactions).where(sql`transaction_date >= now() - interval '30 days'`);
    return { balances, last30Days: flow, timestamp: new Date().toISOString() };
  }

  async getTotalUsersCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    return result[0]?.count || 0;
  }

  async getNewUsersCount(date: Date): Promise<number> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(and(gte(users.createdAt, startOfDay), lte(users.createdAt, endOfDay)));
    return result[0]?.count || 0;
  }

  async getPendingDocumentsCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` }).from(documents).where(or(eq(documents.status, 'pending'), eq(documents.status, 'processing')));
    return result[0]?.count || 0;
  }

  async getAllUsers(page: number = 1, limit: number = 20, search: string = ''): Promise<any> {
    const offset = (page - 1) * limit;
    let query = db.select({
      id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email,
      phone: users.phone, role: users.role, adminRole: users.adminRole, planType: users.planType,
      isVerified: users.isVerified, verificationMethod: users.verificationMethod, twoFactorEnabled: users.twoFactorEnabled,
      createdAt: users.createdAt, updatedAt: users.updatedAt
    }).from(users).orderBy(desc(users.createdAt)).limit(limit).offset(offset);

    if (search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      query = query.where(sql`LOWER(${users.firstName} || ' ' || ${users.lastName} || ' ' || COALESCE(${users.email}, '') || ' ' || ${users.phone}) LIKE ${searchTerm}`) as any;
    }

    const usersList = await query;
    let countQuery = db.select({ count: sql<number>`count(*)::int` }).from(users);
    if (search.trim()) {
      const searchTerm = `%${search.trim().toLowerCase()}%`;
      countQuery = countQuery.where(sql`LOWER(${users.firstName} || ' ' || ${users.lastName} || ' ' || COALESCE(${users.email}, '') || ' ' || ${users.phone}) LIKE ${searchTerm}`) as any;
    }
    const [{ count: totalCount }] = await countQuery;

    return {
      users: usersList,
      pagination: { page, limit, total: totalCount, offset: (page - 1) * limit, pages: Math.ceil(totalCount / limit) }
    };
  }

  async getAllUsersForAdmin(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUserDetails(userId: string): Promise<any> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return null;

    const [accountsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(accounts).where(eq(accounts.userId, userId));
    const [transactionsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(transactions).where(eq(transactions.userId, userId));
    const [bankConnectionsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(bankConnections).where(eq(bankConnections.userId, userId));
    const [lastTransaction] = await db.select({ date: transactions.transactionDate, description: transactions.description, amount: transactions.amount })
      .from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.transactionDate)).limit(1);

    return {
      ...user,
      stats: { accountsCount: accountsCount.count, transactionsCount: transactionsCount.count, bankConnectionsCount: bankConnectionsCount.count },
      lastActivity: lastTransaction ? { date: lastTransaction.date, description: lastTransaction.description, amount: lastTransaction.amount } : null
    };
  }

  async updateUserByAdmin(userId: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set({ ...updates, updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    return user || undefined;
  }

  async deleteUserByAdmin(userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }

  async getRecentLogs(limit: number = 100): Promise<any[]> {
    try {
      const logs = await db.select().from(adminLogs).orderBy(desc(adminLogs.createdAt)).limit(limit);
      return logs;
    } catch (error) {
      console.error('Error getting recent logs:', error);
      return [];
    }
  }

  async getSystemMetrics(): Promise<any> {
    return { status: 'metrics_placeholder', message: 'Moved to AdminService' };
  }

  async getSystemHealth(): Promise<any> {
    try {
      await db.select({ test: sql`1` });
      var dbStatus = 'healthy';
    } catch (error) {
      var dbStatus = 'unhealthy';
    }
    return {
      database: dbStatus, api: 'healthy', memory: process.memoryUsage(), uptime: process.uptime(), timestamp: new Date().toISOString()
    };
  }

  async getApiStatus(): Promise<any> {
    const connectionStatuses = await db.select({
      bankCode: bankConnections.bankCode, status: bankConnections.status, count: sql<number>`count(*)::int`
    }).from(bankConnections).groupBy(bankConnections.bankCode, bankConnections.status);

    const recentSyncs = await db.select({ bankCode: bankConnections.bankCode, lastSync: bankConnections.lastSyncAt, status: bankConnections.status })
      .from(bankConnections).orderBy(desc(bankConnections.lastSyncAt)).limit(20);

    return { connectionStatuses, recentSyncs, timestamp: new Date().toISOString() };
  }

  async getSecurityOverview(): Promise<any> {
    const [twoFactorStats] = await db.select({
      total: sql<number>`count(*)::int`,
      enabled: sql<number>`count(*) FILTER (WHERE two_factor_enabled = true)`,
      disabled: sql<number>`count(*) FILTER (WHERE two_factor_enabled = false)`
    }).from(users);

    const verificationMethods = await db.select({ method: users.verificationMethod, count: sql<number>`count(*)::int` })
      .from(users).where(sql`verification_method IS NOT NULL`).groupBy(users.verificationMethod);

    return {
      twoFactorStats: {
        total: twoFactorStats.total, enabled: twoFactorStats.enabled, disabled: twoFactorStats.disabled,
        adoptionRate: twoFactorStats.total > 0 ? Math.round((twoFactorStats.enabled / twoFactorStats.total) * 100) : 0
      },
      verificationMethods,
      timestamp: new Date().toISOString()
    };
  }
}
