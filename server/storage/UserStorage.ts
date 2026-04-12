import { db } from "../db";
import { 
  users, aiChatSessions, familyGroups, familyGroupMembers, accounts, transactions,
  type User, type InsertUser, type AiChatSession, type InsertAiChatSession,
  type FamilyGroup, type InsertFamilyGroup, type FamilyGroupMember, type InsertFamilyGroupMember,
  type Account, type Transaction
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { IUserStorage } from "./types";

export class UserStorage implements IUserStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user || undefined;
  }

  async getUserBySnils(snils: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.snils, snils));
    return user || undefined;
  }

  async getUserByEsiaOid(esiaOid: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.esiaOid, esiaOid));
    return user || undefined;
  }

  async getUserByIdentifier(identifier: string): Promise<User | undefined> {
    if (identifier.includes('@')) {
      return this.getUserByEmail(identifier);
    } else {
      return this.getUserByPhone(identifier);
    }
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | undefined> {
    const [user] = await db.update(users).set({ ...updates, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async getAiChatSessions(userId: string): Promise<AiChatSession[]> {
    return await db.select().from(aiChatSessions).where(eq(aiChatSessions.userId, userId)).orderBy(desc(aiChatSessions.updatedAt));
  }

  async createAiChatSession(session: InsertAiChatSession): Promise<AiChatSession> {
    const [newSession] = await db.insert(aiChatSessions).values(session).returning();
    return newSession;
  }

  async updateAiChatSession(id: string, updates: Partial<AiChatSession>): Promise<AiChatSession | undefined> {
    const [session] = await db.update(aiChatSessions).set({ ...updates, updatedAt: new Date() }).where(eq(aiChatSessions.id, id)).returning();
    return session || undefined;
  }

  async getFamilyGroupsByAdmin(adminUserId: string): Promise<FamilyGroup[]> {
    return await db.select().from(familyGroups).where(eq(familyGroups.adminUserId, adminUserId)).orderBy(desc(familyGroups.createdAt));
  }

  async createFamilyGroup(group: InsertFamilyGroup): Promise<FamilyGroup> {
    const [newGroup] = await db.insert(familyGroups).values(group).returning();
    return newGroup;
  }

  async addFamilyGroupMember(member: InsertFamilyGroupMember): Promise<FamilyGroupMember> {
    const [newMember] = await db.insert(familyGroupMembers).values(member).returning();
    return newMember;
  }

  async getAccountsByUser(userId: string): Promise<Account[]> {
    return await db.select().from(accounts).where(eq(accounts.userId, userId));
  }

  async getTransactionsByUser(userId: string): Promise<Transaction[]> {
    return await db.select().from(transactions).where(eq(transactions.userId, userId));
  }

  async deleteUserData(userId: string): Promise<void> {
    await db.delete(transactions).where(eq(transactions.userId, userId));
    await db.delete(accounts).where(eq(accounts.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
}
