import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, jsonb, uuid, index, bigserial } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email", { length: 255 }).unique(),
  passwordHash: text("password_hash").notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  middleName: varchar("middle_name", { length: 100 }),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  profileImageUrl: varchar("profile_image_url", { length: 500 }),
  address: text("address"),
  birthDate: timestamp("birth_date"),
  gender: varchar("gender", { length: 1 }), // M, F
  snils: varchar("snils", { length: 255 }).unique(), // зашифровано (fieldEncryption), детерминированно
  inn: varchar("inn", { length: 255 }).unique(), // зашифровано (fieldEncryption), детерминированно
  esiaOid: varchar("esia_oid", { length: 50 }).unique(),
  role: varchar("role", { length: 20 }).default("personal"), // personal, family_admin, family_member, business
  adminRole: varchar("admin_role", { length: 20 }), // super_admin, devops_admin, analytics_admin, finance_admin, api_admin, security_admin
  planType: varchar("plan_type", { length: 20 }).default("free"), // free, premium, family, business
  isVerified: boolean("is_verified").default(false),
  isPhoneVerified: boolean("is_phone_verified").default(false),
  isEmailVerified: boolean("is_email_verified").default(false),
  verificationLevel2: boolean("verification_level_2").default(false),
  verificationLevel3: boolean("verification_level_3").default(false),
  verificationMethod: varchar("verification_method", { length: 20 }), // phone, email, esia
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  twoFactorSecret: text("two_factor_secret"), // зашифровано (fieldEncryption)
  twoFactorBackupCodes: text("two_factor_backup_codes").array(), // HMAC-хеши кодов
  smsCodeExpiry: timestamp("sms_code_expiry"),
  smsCode: varchar("sms_code", { length: 6 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  emailIdx: index("email_idx").on(table.email),
  phoneIdx: index("phone_idx").on(table.phone),
  snilsIdx: index("snils_idx").on(table.snils),
  innIdx: index("inn_idx").on(table.inn),
}));

export const bankConnections = pgTable("bank_connections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  bankCode: varchar("bank_code", { length: 50 }).notNull(), // sberbank, vtb, tinkoff
  bankName: varchar("bank_name", { length: 100 }).notNull(),
  accessToken: text("access_token"), // зашифровано (fieldEncryption)
  refreshToken: text("refresh_token"), // зашифровано (fieldEncryption)
  consentId: varchar("consent_id", { length: 100 }),
  status: varchar("status", { length: 20 }).default("active"), // active, expired, revoked
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userBankIdx: index("user_bank_idx").on(table.userId, table.bankCode),
}));

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  bankConnectionId: uuid("bank_connection_id").references(() => bankConnections.id).notNull(),
  externalAccountId: varchar("external_account_id", { length: 100 }).notNull(),
  accountType: varchar("account_type", { length: 50 }).notNull(), // checking, savings, credit
  accountName: varchar("account_name", { length: 100 }).notNull(),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("RUB"),
  isActive: boolean("is_active").default(true),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
}, (table) => ({
  userAccountIdx: index("user_account_idx").on(table.userId),
  bankAccountIdx: index("bank_account_idx").on(table.bankConnectionId),
}));

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  accountId: uuid("account_id").references(() => accounts.id).notNull(),
  externalTransactionId: varchar("external_transaction_id", { length: 100 }),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("RUB"),
  description: text("description").notNull(),
  merchant: varchar("merchant", { length: 200 }),
  category: varchar("category", { length: 50 }),
  subcategory: varchar("subcategory", { length: 50 }),
  transactionDate: timestamp("transaction_date").notNull(),
  processingDate: timestamp("processing_date").defaultNow(),
  isRecurring: boolean("is_recurring").default(false),
  metadata: jsonb("metadata"), // additional transaction data
}, (table) => ({
  userTransactionIdx: index("user_transaction_idx").on(table.userId, table.transactionDate),
  accountTransactionIdx: index("account_transaction_idx").on(table.accountId),
  categoryIdx: index("category_idx").on(table.category),
}));

export const savingsGoals = pgTable("savings_goals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  targetAmount: decimal("target_amount", { precision: 15, scale: 2 }).notNull(),
  currentAmount: decimal("current_amount", { precision: 15, scale: 2 }).default("0"),
  targetDate: timestamp("target_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userGoalIdx: index("user_goal_idx").on(table.userId),
}));

export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  monthlyLimit: decimal("monthly_limit", { precision: 15, scale: 2 }).notNull(),
  currentSpent: decimal("current_spent", { precision: 15, scale: 2 }).default("0"),
  month: integer("month").notNull(), // 1-12
  year: integer("year").notNull(),
  isActive: boolean("is_active").default(true),
}, (table) => ({
  userBudgetIdx: index("user_budget_idx").on(table.userId, table.month, table.year),
}));

export const aiChatSessions = pgTable("ai_chat_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  sessionId: varchar("session_id", { length: 100 }).notNull(),
  messages: jsonb("messages").notNull(), // array of chat messages
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userSessionIdx: index("user_session_idx").on(table.userId),
}));

// Family Groups table
export const familyGroups = pgTable("family_groups", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 100 }).notNull(),
  adminUserId: uuid("admin_user_id").references(() => users.id).notNull(),
  inviteCode: varchar("invite_code", { length: 10 }).unique(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Family Group Members table
export const familyGroupMembers = pgTable("family_group_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: uuid("group_id").references(() => familyGroups.id).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  role: varchar("role", { length: 20 }).default("member"), // admin, member, observer
  permissions: jsonb("permissions").default('{}'), // category access, budget limits, etc
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => ({
  groupUserIdx: index("group_user_idx").on(table.groupId, table.userId),
}));

// Admin Roles and Permissions table
export const adminRoles = pgTable("admin_roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 50 }).notNull().unique(),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  permissions: jsonb("permissions").notNull(), // array of permission strings
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin Activity Logs table
export const adminLogs = pgTable("admin_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: uuid("admin_user_id").references(() => users.id).notNull(),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("target_type", { length: 50 }), // user, transaction, system, etc
  targetId: varchar("target_id", { length: 100 }),
  details: jsonb("details"), // action details and metadata
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  adminUserIdx: index("admin_user_idx").on(table.adminUserId),
  actionIdx: index("action_idx").on(table.action),
  createdAtIdx: index("admin_logs_created_at_idx").on(table.createdAt),
}));

// System Settings table
export const systemSettings = pgTable("system_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: varchar("key", { length: 100 }).notNull().unique(),
  value: jsonb("value").notNull(),
  category: varchar("category", { length: 50 }).notNull(), // security, api, notifications, etc
  description: text("description"),
  isEditable: boolean("is_editable").default(true),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("system_settings_category_idx").on(table.category),
}));

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  bankConnections: many(bankConnections),
  accounts: many(accounts),
  transactions: many(transactions),
  savingsGoals: many(savingsGoals),
  budgets: many(budgets),
  aiChatSessions: many(aiChatSessions),
  adminFamilyGroups: many(familyGroups),
  familyGroupMemberships: many(familyGroupMembers),
  documents: many(documents),
}));

export const bankConnectionsRelations = relations(bankConnections, ({ one, many }) => ({
  user: one(users, { fields: [bankConnections.userId], references: [users.id] }),
  accounts: many(accounts),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
  bankConnection: one(bankConnections, { fields: [accounts.bankConnectionId], references: [bankConnections.id] }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, { fields: [transactions.userId], references: [users.id] }),
  account: one(accounts, { fields: [transactions.accountId], references: [accounts.id] }),
}));

export const savingsGoalsRelations = relations(savingsGoals, ({ one }) => ({
  user: one(users, { fields: [savingsGoals.userId], references: [users.id] }),
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
  user: one(users, { fields: [budgets.userId], references: [users.id] }),
}));

export const aiChatSessionsRelations = relations(aiChatSessions, ({ one }) => ({
  user: one(users, { fields: [aiChatSessions.userId], references: [users.id] }),
}));

export const familyGroupsRelations = relations(familyGroups, ({ one, many }) => ({
  admin: one(users, { fields: [familyGroups.adminUserId], references: [users.id] }),
  members: many(familyGroupMembers),
}));

export const familyGroupMembersRelations = relations(familyGroupMembers, ({ one }) => ({
  group: one(familyGroups, { fields: [familyGroupMembers.groupId], references: [familyGroups.id] }),
  user: one(users, { fields: [familyGroupMembers.userId], references: [users.id] }),
}));

export const adminRolesRelations = relations(adminRoles, ({ many }) => ({
  logs: many(adminLogs),
}));

export const adminLogsRelations = relations(adminLogs, ({ one }) => ({
  admin: one(users, { fields: [adminLogs.adminUserId], references: [users.id] }),
}));

export const systemSettingsRelations = relations(systemSettings, ({ one }) => ({
  updatedByUser: one(users, { fields: [systemSettings.updatedBy], references: [users.id] }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBankConnectionSchema = createInsertSchema(bankConnections).omit({
  id: true,
  createdAt: true,
});

export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  lastUpdatedAt: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  processingDate: true,
});

export const insertSavingsGoalSchema = createInsertSchema(savingsGoals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBudgetSchema = createInsertSchema(budgets).omit({
  id: true,
});

export const insertAiChatSessionSchema = createInsertSchema(aiChatSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFamilyGroupSchema = createInsertSchema(familyGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFamilyGroupMemberSchema = createInsertSchema(familyGroupMembers).omit({
  id: true,
  joinedAt: true,
});

export const insertAdminRoleSchema = createInsertSchema(adminRoles).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAdminLogSchema = createInsertSchema(adminLogs).omit({
  id: true,
  createdAt: true,
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({
  id: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type BankConnection = typeof bankConnections.$inferSelect;
export type InsertBankConnection = z.infer<typeof insertBankConnectionSchema>;
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type InsertSavingsGoal = z.infer<typeof insertSavingsGoalSchema>;
export type Budget = typeof budgets.$inferSelect;
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type AiChatSession = typeof aiChatSessions.$inferSelect;
export type InsertAiChatSession = z.infer<typeof insertAiChatSessionSchema>;
export type FamilyGroup = typeof familyGroups.$inferSelect;
export type InsertFamilyGroup = z.infer<typeof insertFamilyGroupSchema>;
export type FamilyGroupMember = typeof familyGroupMembers.$inferSelect;
export type InsertFamilyGroupMember = z.infer<typeof insertFamilyGroupMemberSchema>;
export type AdminRole = typeof adminRoles.$inferSelect;
export type InsertAdminRole = z.infer<typeof insertAdminRoleSchema>;
export type AdminLog = typeof adminLogs.$inferSelect;
export type InsertAdminLog = z.infer<typeof insertAdminLogSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;

// Document verification system
export const documentTypes = pgTable("document_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(), // "passport", "driver_license", "snils", etc.
  displayName: varchar("display_name").notNull(),
  description: text("description"),
  requiredFields: jsonb("required_fields"), // What fields should be extracted
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  documentTypeId: varchar("document_type_id").notNull().references(() => documentTypes.id),
  fileName: varchar("file_name").notNull(),
  filePath: varchar("file_path").notNull(), // Object storage path
  fileSize: integer("file_size").notNull(),
  mimeType: varchar("mime_type").notNull(),
  checksum: varchar("checksum"), // SHA-256 checksum for file integrity
  status: varchar("status").notNull().default("uploaded"), // uploaded, pending, processing, verified, rejected, expired
  verificationMethod: varchar("verification_method"), // manual, ai, ocr, hybrid
  extractedData: jsonb("extracted_data"), // OCR/AI extracted information
  verificationNotes: text("verification_notes"),
  verifiedBy: varchar("verified_by"), // admin user ID who verified manually
  verifiedAt: timestamp("verified_at"),
  rejectionReason: text("rejection_reason"),
  expiresAt: timestamp("expires_at"), // For documents with expiration dates
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const documentVerificationHistory = pgTable("document_verification_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id),
  previousStatus: varchar("previous_status").notNull(),
  newStatus: varchar("new_status").notNull(),
  changedBy: varchar("changed_by"), // user ID who made the change
  changeReason: text("change_reason"),
  metadata: jsonb("metadata"), // Additional verification data
  createdAt: timestamp("created_at").defaultNow(),
});

// Document relations
export const documentTypesRelations = relations(documentTypes, ({ many }) => ({
  documents: many(documents),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  user: one(users, {
    fields: [documents.userId],
    references: [users.id],
  }),
  documentType: one(documentTypes, {
    fields: [documents.documentTypeId],
    references: [documentTypes.id],
  }),
  verificationHistory: many(documentVerificationHistory),
}));

export const documentVerificationHistoryRelations = relations(documentVerificationHistory, ({ one }) => ({
  document: one(documents, {
    fields: [documentVerificationHistory.documentId],
    references: [documents.id],
  }),
}));

// Document insert schemas
export const insertDocumentTypeSchema = createInsertSchema(documentTypes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentVerificationHistorySchema = createInsertSchema(documentVerificationHistory).omit({
  id: true,
  createdAt: true,
});

// Verification system tables
export const verificationLevels = pgTable("verification_levels", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  level: integer("level").notNull().unique(), // 1, 2, 3
  name: varchar("name").notNull(), // "Упрощенная", "Стандартная", "Полная"
  description: text("description"),
  monthlyLimit: decimal("monthly_limit", { precision: 15, scale: 2 }).notNull(),
  balanceLimit: decimal("balance_limit", { precision: 15, scale: 2 }),
  requiredVerifications: jsonb("required_verifications").notNull(), // array of verification types
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const userVerifications = pgTable("user_verifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  currentLevel: integer("current_level").default(1), // Current verification level
  phoneVerified: boolean("phone_verified").default(false),
  phoneVerifiedAt: timestamp("phone_verified_at"),
  emailVerified: boolean("email_verified").default(false),  
  emailVerifiedAt: timestamp("email_verified_at"),
  documentsVerified: boolean("documents_verified").default(false),
  documentsVerifiedAt: timestamp("documents_verified_at"),
  gosuslugiVerified: boolean("gosuslugi_verified").default(false),
  gosuslugiVerifiedAt: timestamp("gosuslugi_verified_at"),
  bankingVerified: boolean("banking_verified").default(false),
  bankingVerifiedAt: timestamp("banking_verified_at"),
  lastUpgradeAttempt: timestamp("last_upgrade_attempt"),
  nextUpgradeEligible: timestamp("next_upgrade_eligible"),
  monthlyUsage: decimal("monthly_usage", { precision: 15, scale: 2 }).default("0"),
  usageResetDate: timestamp("usage_reset_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userVerificationIdx: index("user_verification_idx").on(table.userId),
}));

// Сессии входа: одна запись на устройство. Refresh-токен хранится только SHA-256 хешем,
// при каждом обновлении он меняется (предыдущий хеш — для обнаружения повторного использования)
export const authSessions = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  refreshTokenHash: varchar("refresh_token_hash", { length: 64 }).notNull().unique(),
  previousTokenHash: varchar("previous_token_hash", { length: 64 }),
  rotatedAt: timestamp("rotated_at"),
  deviceName: varchar("device_name", { length: 200 }),
  ipAddress: varchar("ip_address", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
}, (table) => ({
  userIdx: index("auth_sessions_user_idx").on(table.userId),
  previousTokenIdx: index("auth_sessions_previous_token_idx").on(table.previousTokenHash),
}));

export type AuthSession = typeof authSessions.$inferSelect;

// Продуктовые события для метрик активации и удержания (решение D10). Хранятся 400 дней: чистит задача cleanup.events.
// ПДн в props не пишутся — валидатор в services/analytics.ts их вырезает.
export const productEvents = pgTable("product_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  anonymousId: varchar("anonymous_id", { length: 64 }),
  sessionId: varchar("session_id", { length: 64 }),
  name: varchar("name", { length: 64 }).notNull(),
  props: jsonb("props").notNull().default({}),
  platform: varchar("platform", { length: 10 }).notNull(), // web | pwa | android | ios | server
  appVersion: varchar("app_version", { length: 20 }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  nameTimeIdx: index("product_events_name_time_idx").on(table.name, table.occurredAt),
  userTimeIdx: index("product_events_user_time_idx").on(table.userId, table.occurredAt),
}));

export type ProductEvent = typeof productEvents.$inferSelect;
export type InsertProductEvent = typeof productEvents.$inferInsert;

export const verificationCodes = pgTable("verification_codes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  type: varchar("type").notNull(), // "sms", "email"
  code: varchar("code", { length: 10 }).notNull(),
  target: varchar("target").notNull(), // phone number or email
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  isUsed: boolean("is_used").default(false),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userCodeIdx: index("user_code_idx").on(table.userId, table.type),
  expireIdx: index("verification_codes_expire_idx").on(table.expiresAt),
}));

export const verificationRequests = pgTable("verification_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  requestedLevel: integer("requested_level").notNull(),
  currentLevel: integer("current_level").notNull(),
  status: varchar("status").default("pending"), // pending, processing, approved, rejected
  submittedData: jsonb("submitted_data"), // User submitted information
  verificationResults: jsonb("verification_results"), // Automated checks results
  reviewedBy: uuid("reviewed_by").references(() => users.id),
  reviewNotes: text("review_notes"),
  rejectionReason: text("rejection_reason"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userRequestIdx: index("user_request_idx").on(table.userId),
  statusIdx: index("verification_request_status_idx").on(table.status),
}));

// Verification relations
export const verificationLevelsRelations = relations(verificationLevels, ({ many }) => ({
  userVerifications: many(userVerifications),
  verificationRequests: many(verificationRequests),
}));

export const userVerificationsRelations = relations(userVerifications, ({ one, many }) => ({
  user: one(users, { fields: [userVerifications.userId], references: [users.id] }),
  verificationCodes: many(verificationCodes),
  verificationRequests: many(verificationRequests),
}));

export const verificationCodesRelations = relations(verificationCodes, ({ one }) => ({
  user: one(users, { fields: [verificationCodes.userId], references: [users.id] }),
}));

export const verificationRequestsRelations = relations(verificationRequests, ({ one }) => ({
  user: one(users, { fields: [verificationRequests.userId], references: [users.id] }),
  reviewer: one(users, { fields: [verificationRequests.reviewedBy], references: [users.id] }),
}));

// Verification insert schemas
export const insertVerificationLevelSchema = createInsertSchema(verificationLevels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserVerificationSchema = createInsertSchema(userVerifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVerificationCodeSchema = createInsertSchema(verificationCodes).omit({
  id: true,
  createdAt: true,
});

export const insertVerificationRequestSchema = createInsertSchema(verificationRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Document types
export type DocumentType = typeof documentTypes.$inferSelect;
export type InsertDocumentType = z.infer<typeof insertDocumentTypeSchema>;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DocumentVerificationHistory = typeof documentVerificationHistory.$inferSelect;
export type InsertDocumentVerificationHistory = z.infer<typeof insertDocumentVerificationHistorySchema>;

// Verification types  
export type VerificationLevel = typeof verificationLevels.$inferSelect;
export type InsertVerificationLevel = z.infer<typeof insertVerificationLevelSchema>;
export type UserVerification = typeof userVerifications.$inferSelect;
export type InsertUserVerification = z.infer<typeof insertUserVerificationSchema>;
export type VerificationCode = typeof verificationCodes.$inferSelect;
export type InsertVerificationCode = z.infer<typeof insertVerificationCodeSchema>;
export type VerificationRequest = typeof verificationRequests.$inferSelect;
export type InsertVerificationRequest = z.infer<typeof insertVerificationRequestSchema>;
