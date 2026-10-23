import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, jsonb, uuid, index, uniqueIndex, primaryKey, check, bigserial, date, real, smallint, type AnyPgColumn } from "drizzle-orm/pg-core";
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
  // Часовой пояс задаёт local_date операций и границы месяцев; базовая валюта в MVP всегда RUB (E1.1)
  timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/Moscow"),
  baseCurrency: varchar("base_currency", { length: 3 }).notNull().default("RUB"),
  onboardingDismissedAt: timestamp("onboarding_dismissed_at", { withTimezone: true }), // «Скрыть» чек-лист на главной (E1.5)
  emailNotifications: boolean("email_notifications").notNull().default(true), // письма о важных уведомлениях (D19)
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

// Счета пользователя (E1.1). Остаток balance — кеш: opening_balance + сумма проведённых неудалённых операций,
// его пересчитывает ledgerService в той же транзакции, что и запись операции.
export const ACCOUNT_KINDS = [
  "cash", "debit_card", "credit_card", "current", "savings", "deposit", "loan", "digital_ruble",
  "brokerage", "iis", // брокерский счёт и ИИС: учитываются в балансе, детали портфеля — E3.7
  "other",
] as const;

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  bankConnectionId: uuid("bank_connection_id").references(() => bankConnections.id), // только у счетов из банковского API
  externalAccountId: varchar("external_account_id", { length: 100 }),
  accountType: varchar("account_type", { length: 50 }), // устарело, заменено kind; удаляется на этапе 2
  accountName: varchar("account_name", { length: 100 }).notNull(),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("RUB"),
  isActive: boolean("is_active").default(true),
  lastUpdatedAt: timestamp("last_updated_at").defaultNow(),
  kind: varchar("kind", { length: 20 }).notNull().default("debit_card"),
  institutionCode: varchar("institution_code", { length: 30 }), // sber | tbank | alfa | vtb | ozon | yandex | gazprom | raif | other
  source: varchar("source", { length: 20 }).notNull().default("manual"), // manual | import | bank_api
  openingBalance: decimal("opening_balance", { precision: 15, scale: 2 }).notNull().default("0"),
  openingBalanceDate: date("opening_balance_date"), // null — учитывать все операции
  lastFour: varchar("last_four", { length: 4 }),
  creditLimit: decimal("credit_limit", { precision: 15, scale: 2 }),
  includeInTotal: boolean("include_in_total").notNull().default(true),
  color: varchar("color", { length: 7 }),
  icon: varchar("icon", { length: 40 }),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  userAccountIdx: index("user_account_idx").on(table.userId),
  bankAccountIdx: index("bank_account_idx").on(table.bankConnectionId),
  userUpdatedIdx: index("accounts_user_updated_idx").on(table.userId, table.updatedAt, table.id),
  kindCheck: check("accounts_kind_check", sql`${table.kind} in (${sql.raw(ACCOUNT_KINDS.map((kind) => `'${kind}'`).join(", "))})`),
  sourceCheck: check("accounts_source_check", sql`${table.source} in ('manual', 'import', 'bank_api')`),
}));

// Операции (E1.1). Сумма со знаком: расход < 0, доход > 0; тип задан явно. Перевод — две операции с общим
// transfer_group_id. Корректировка остатка (adjustment) и переводы в статистику не входят.
export const TRANSACTION_TYPES = ["expense", "income", "transfer", "adjustment"] as const;

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  accountId: uuid("account_id").references(() => accounts.id).notNull(),
  externalTransactionId: varchar("external_transaction_id", { length: 100 }),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("RUB"),
  description: text("description").notNull(),
  merchant: varchar("merchant", { length: 200 }),
  category: varchar("category", { length: 50 }), // устарело: перенесено в category_id миграцией 0014, не читается; удаляется в конце этапа 1
  subcategory: varchar("subcategory", { length: 50 }), // устарело
  transactionDate: timestamp("transaction_date").notNull(), // момент операции; без времени — 12:00 по поясу пользователя
  processingDate: timestamp("processing_date").defaultNow(),
  isRecurring: boolean("is_recurring").default(false), // устарело, заменено recurring_series_id (E1.6)
  metadata: jsonb("metadata"), // additional transaction data
  type: varchar("type", { length: 12 }).notNull().default("expense"),
  status: varchar("status", { length: 10 }).notNull().default("posted"),
  localDate: date("local_date").notNull(), // дата операции в часовом поясе пользователя
  hasTime: boolean("has_time").notNull().default(true),
  categoryId: uuid("category_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
  categorySource: varchar("category_source", { length: 12 }).notNull().default("none"), // manual | rule_user | merchant | mcc | bank | keyword | llm | transfer | none
  categoryConfidence: real("category_confidence"),
  merchantNormalized: varchar("merchant_normalized", { length: 120 }),
  mcc: varchar("mcc", { length: 4 }),
  bankCategory: varchar("bank_category", { length: 100 }),
  note: text("note"),
  transferGroupId: uuid("transfer_group_id"),
  source: varchar("source", { length: 12 }).notNull().default("manual"), // manual | import | notification | bank_api | receipt
  importBatchId: uuid("import_batch_id"), // FK добавляет E1.2
  dedupHash: varchar("dedup_hash", { length: 64 }),
  dedupSeq: smallint("dedup_seq"),
  originalAmount: decimal("original_amount", { precision: 15, scale: 2 }),
  originalCurrency: varchar("original_currency", { length: 3 }),
  amountRub: decimal("amount_rub", { precision: 15, scale: 2 }), // для агрегатов; для валюты — по курсу ЦБ на local_date
  excludeFromStats: boolean("exclude_from_stats").notNull().default(false),
  recurringSeriesId: uuid("recurring_series_id").references((): AnyPgColumn => recurringSeries.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  accountTransactionIdx: index("account_transaction_idx").on(table.accountId),
  userDateIdx: index("tx_user_date_idx").on(table.userId, table.localDate.desc(), table.createdAt.desc(), table.id.desc()).where(sql`${table.deletedAt} is null`),
  accountDateIdx: index("tx_account_date_idx").on(table.accountId, table.localDate),
  userCategoryDateIdx: index("tx_user_cat_date_idx").on(table.userId, table.categoryId, table.localDate).where(sql`${table.deletedAt} is null`),
  userUpdatedIdx: index("tx_user_updated_idx").on(table.userId, table.updatedAt, table.id),
  transferGroupIdx: index("tx_transfer_group_idx").on(table.transferGroupId).where(sql`${table.transferGroupId} is not null`),
  recurringSeriesIdx: index("tx_recurring_series_idx").on(table.recurringSeriesId).where(sql`${table.recurringSeriesId} is not null`),
  typeCheck: check("tx_type_check", sql`${table.type} in ('expense', 'income', 'transfer', 'adjustment')`),
  statusCheck: check("tx_status_check", sql`${table.status} in ('posted', 'pending')`),
  // Расход — только с минусом, доход — только с плюсом; знак перевода и корректировки задаёт направление
  signCheck: check("tx_sign_check", sql`(${table.type} = 'expense' and ${table.amount} < 0) or (${table.type} = 'income' and ${table.amount} > 0) or ${table.type} in ('transfer', 'adjustment')`),
}));

// Цели v2 (E1.4-T5): накопление взносами (goal_contributions) или по остатку привязанного счёта.
// current_amount — кеш, его пересчитывает сервис; is_active заменён archived_at и удаляется в конце этапа 1
export const savingsGoals = pgTable("savings_goals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  targetAmount: decimal("target_amount", { precision: 15, scale: 2 }).notNull(),
  currentAmount: decimal("current_amount", { precision: 15, scale: 2 }).default("0"),
  targetDate: date("target_date"),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  // остаток счёта на момент привязки при «считать только новые деньги»; null — считается весь остаток
  accountBaseline: decimal("account_baseline", { precision: 15, scale: 2 }),
  icon: varchar("icon", { length: 40 }),
  color: varchar("color", { length: 7 }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  isActive: boolean("is_active").default(true), // устарело
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userGoalIdx: index("user_goal_idx").on(table.userId),
  targetCheck: check("savings_goals_target_check", sql`${table.targetAmount} > 0`),
}));

// Взносы в цель (E1.4-T5): отрицательная сумма — снятие
export const goalContributions = pgTable("goal_contributions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  goalId: uuid("goal_id").notNull().references(() => savingsGoals.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  date: date("date").notNull(),
  transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  note: varchar("note", { length: 200 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  goalDateIdx: index("goal_contrib_goal_date_idx").on(table.goalId, table.date),
  amountCheck: check("goal_contributions_amount_check", sql`${table.amount} <> 0`),
}));

// Бюджеты v2 (E1.4): лимит на категорию (с подкатегориями) или общий (category_id = null), действует помесячно
// с effective_from (1-е число) до effective_to (последний день месяца, null — бессрочно). Смена лимита с какого-то
// месяца закрывает старую версию и открывает новую — прошлые месяцы не меняются. Пересечение версий одной категории
// запрещает сервис (проверка под блокировкой в транзакции).
export const budgets = pgTable("budgets", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id).notNull(),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "cascade" }),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  period: varchar("period", { length: 10 }).notNull().default("month"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  rollover: boolean("rollover").notNull().default(false),
  excludedCategoryIds: uuid("excluded_category_ids").array().notNull().default(sql`'{}'::uuid[]`),
  alertThresholds: integer("alert_thresholds").array().notNull().default(sql`'{80,100}'::integer[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  // устаревшие колонки v1: больше не читаются, удаляются в конце этапа 1
  category: varchar("category", { length: 50 }),
  monthlyLimit: decimal("monthly_limit", { precision: 15, scale: 2 }),
  currentSpent: decimal("current_spent", { precision: 15, scale: 2 }).default("0"),
  month: integer("month"),
  year: integer("year"),
  isActive: boolean("is_active").default(true),
}, (table) => ({
  userPeriodIdx: index("budgets_user_period_idx").on(table.userId, table.effectiveFrom, table.effectiveTo),
  userUpdatedIdx: index("budgets_user_updated_idx").on(table.userId, table.updatedAt),
  amountCheck: check("budgets_amount_check", sql`${table.amount} > 0`),
  periodCheck: check("budgets_period_check", sql`${table.period} = 'month'`),
  monthStartCheck: check("budgets_month_start_check", sql`extract(day from ${table.effectiveFrom}) = 1`),
  rangeCheck: check("budgets_range_check", sql`${table.effectiveTo} is null or ${table.effectiveTo} >= ${table.effectiveFrom}`),
}));

// Пройденные пороги бюджета за месяц (E1.4-T3): по одной записи на бюджет, месяц и порог — предупреждение не повторяется
export const budgetAlerts = pgTable("budget_alerts", {
  budgetId: uuid("budget_id").notNull().references(() => budgets.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  threshold: integer("threshold").notNull(),
  firedAt: timestamp("fired_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.budgetId, table.periodStart, table.threshold] }),
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

// In-app уведомления (E1.0-T4): колокольчик в шапке. dedup_key не даёт создать повтор одного события
// (например, «бюджет 80% за октябрь» — один раз); deep_link — относительный путь SPA.
export const NOTIFICATION_TYPES = ["budget_threshold", "recurring_upcoming", "recurring_new", "recurring_after_cancel", "import_done", "goal_reached", "system"] as const;

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 40 }).notNull(),
  title: varchar("title", { length: 140 }).notNull(),
  body: text("body"),
  deepLink: varchar("deep_link", { length: 300 }),
  payload: jsonb("payload").notNull().default({}),
  dedupKey: varchar("dedup_key", { length: 120 }),
  readAt: timestamp("read_at", { withTimezone: true }),
  emailedAt: timestamp("emailed_at", { withTimezone: true }), // письмо отправлено (D19); повтор задачи не шлёт второе
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userCreatedIdx: index("notifications_user_created_idx").on(table.userId, table.createdAt),
  userDedupUq: uniqueIndex("notifications_user_dedup_uq").on(table.userId, table.dedupKey),
  typeCheck: check("notifications_type_check", sql`${table.type} in ('budget_threshold', 'recurring_upcoming', 'recurring_new', 'recurring_after_cancel', 'import_done', 'goal_reached', 'system')`),
  deepLinkCheck: check("notifications_deep_link_check", sql`${table.deepLink} is null or (${table.deepLink} like '/%' and ${table.deepLink} not like '//%')`),
}));

// Справочник сервисов подписок (E1.6-T1): узнать сервис по мерчанту, сгруппировать дубли, подсказать отмену.
// verified_at — когда ссылка и шаги отмены последний раз сверены вручную; null — не сверены
export const subscriptionServices = pgTable("subscription_services", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 50 }).notNull().unique(),
  name: varchar("name", { length: 100 }).notNull(),
  // video | music | bundle | books | cloud | software | marketplace | bank | telecom | ai | store
  serviceGroup: varchar("service_group", { length: 30 }).notNull(),
  patterns: text("patterns").array().notNull(), // подстроки нормализованного описания операции
  typicalPeriod: varchar("typical_period", { length: 10 }),
  trialDays: integer("trial_days"),
  cancelUrl: varchar("cancel_url", { length: 300 }),
  cancelSteps: text("cancel_steps"),
  verifiedAt: date("verified_at"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Регулярные платежи и доходы (E1.6): серия операций с одним ключом группировки, найденная детектором или отмеченная вручную
export const recurringSeries = pgTable("recurring_series", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  groupKey: varchar("group_key", { length: 160 }).notNull(),
  displayName: varchar("display_name", { length: 120 }).notNull(),
  direction: varchar("direction", { length: 3 }).notNull(), // out | in
  kind: varchar("kind", { length: 12 }).notNull(), // subscription | utility | loan | rent | salary | pension (пенсия, пособия) | trial | other
  serviceId: uuid("service_id").references(() => subscriptionServices.id, { onDelete: "set null" }),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }), // последний использованный
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  currency: varchar("currency", { length: 3 }).notNull().default("RUB"),
  periodicity: varchar("periodicity", { length: 10 }).notNull(), // weekly | biweekly | monthly | quarterly | yearly
  intervalDays: integer("interval_days").notNull(),
  amountLast: decimal("amount_last", { precision: 15, scale: 2 }).notNull(),
  amountMedian: decimal("amount_median", { precision: 15, scale: 2 }).notNull(),
  amountMin: decimal("amount_min", { precision: 15, scale: 2 }).notNull(),
  amountMax: decimal("amount_max", { precision: 15, scale: 2 }).notNull(),
  // прошлая сумма, если последнее списание её изменило — для «Цена выросла на 100 ₽»
  amountPrevious: decimal("amount_previous", { precision: 15, scale: 2 }),
  priceChangedAt: date("price_changed_at"),
  occurrences: integer("occurrences").notNull(),
  firstDate: date("first_date").notNull(),
  lastDate: date("last_date").notNull(),
  nextExpectedDate: date("next_expected_date"),
  expectedAmount: decimal("expected_amount", { precision: 15, scale: 2 }),
  confidence: real("confidence").notNull(),
  source: varchar("source", { length: 8 }).notNull().default("detector"), // detector | manual
  status: varchar("status", { length: 10 }).notNull().default("detected"), // detected | confirmed | ignored | cancelled | ended
  remindDaysBefore: integer("remind_days_before").notNull().default(2),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  userKeyUq: uniqueIndex("recurring_series_user_key_uq").on(table.userId, table.direction, table.groupKey, table.currency),
  userNextIdx: index("recurring_series_user_next_idx").on(table.userId, table.status, table.nextExpectedDate),
  userUpdatedIdx: index("recurring_series_user_updated_idx").on(table.userId, table.updatedAt),
  directionCheck: check("recurring_series_direction_check", sql`${table.direction} in ('out', 'in')`),
  kindCheck: check("recurring_series_kind_check", sql`${table.kind} in ('subscription', 'utility', 'loan', 'rent', 'salary', 'pension', 'trial', 'other')`),
  periodicityCheck: check("recurring_series_periodicity_check", sql`${table.periodicity} in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')`),
  statusCheck: check("recurring_series_status_check", sql`${table.status} in ('detected', 'confirmed', 'ignored', 'cancelled', 'ended')`),
  remindCheck: check("recurring_series_remind_check", sql`${table.remindDaysBefore} between 0 and 7`),
}));

export type SubscriptionService = typeof subscriptionServices.$inferSelect;
export type RecurringSeries = typeof recurringSeries.$inferSelect;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// Справочник категорий (E1.3): системные — user_id = null и неизменяемый code (на него ссылаются правила,
// MCC-маппинг, кешбэк E2.5 и вычеты E2.6), пользовательские — со своим user_id. Два уровня: родитель и подкатегория.
const NO_ID = sql`'00000000-0000-0000-0000-000000000000'::uuid`;
export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "restrict" }),
  code: varchar("code", { length: 50 }),
  name: varchar("name", { length: 60 }).notNull(),
  kind: varchar("kind", { length: 10 }).notNull(), // expense | income | transfer
  icon: varchar("icon", { length: 40 }), // имя иконки lucide
  color: varchar("color", { length: 7 }),
  taxDeduction: varchar("tax_deduction", { length: 12 }), // medical | education | sport | insurance
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => ({
  codeUq: uniqueIndex("categories_code_uq").on(table.code),
  userParentNameUq: uniqueIndex("categories_user_parent_name_uq")
    .on(sql`coalesce(${table.userId}, ${NO_ID})`, sql`coalesce(${table.parentId}, ${NO_ID})`, sql`lower(${table.name})`)
    .where(sql`${table.deletedAt} is null`),
  userUpdatedIdx: index("categories_user_updated_idx").on(table.userId, table.updatedAt),
  kindCheck: check("categories_kind_check", sql`${table.kind} in ('expense', 'income', 'transfer')`),
  // у системной категории есть код и нет владельца, у пользовательской — наоборот
  systemCheck: check("categories_system_check", sql`(${table.userId} is null) = (${table.code} is not null)`),
}));

// Скрытие и переименование системных категорий конкретным пользователем
export const userCategoryPrefs = pgTable("user_category_prefs", {
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  hidden: boolean("hidden").notNull().default(false),
  customName: varchar("custom_name", { length: 60 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.categoryId] }),
}));

// Справочник MCC (E1.3-T4) для автокатегоризации. confidence < 0,5 — у кода двойной смысл (5311, 5399 — и маркетплейсы,
// и универмаги; 4829 — переводы и свои, и людям): такой MCC уступает словарю мерчантов и описанию.
export const mccCodes = pgTable("mcc_codes", {
  code: varchar("code", { length: 4 }).primaryKey(),
  nameRu: varchar("name_ru", { length: 200 }).notNull(),
  categoryCode: varchar("category_code", { length: 50 }).notNull(), // → categories.code
  confidence: real("confidence").notNull().default(0.9),
});

// Категория банка из выписки → наша (E1.3-T4). Название хранится нормализованным (нижний регистр, ё → е, без точки
// в конце); institution_code = 'any' — общие названия для любого банка. direction: out — списание, in — поступление.
export const bankCategoryMap = pgTable("bank_category_map", {
  institutionCode: varchar("institution_code", { length: 30 }).notNull(),
  bankCategory: varchar("bank_category", { length: 100 }).notNull(),
  direction: varchar("direction", { length: 3 }).notNull().default("out"),
  categoryCode: varchar("category_code", { length: 50 }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.institutionCode, table.bankCategory, table.direction] }),
  directionCheck: check("bank_category_map_direction_check", sql`${table.direction} in ('in', 'out')`),
}));

// Словарь мерчантов (E1.3-T5): строка из выписки → название мерчанта и категория по умолчанию. pattern хранится
// нормализованным (normalizeMerchantText): contains — целые слова подряд, starts_with — с начала строки, regex — по
// нормализованной строке. Совпали несколько — выигрывает меньший priority, затем более длинный шаблон.
// category_code = null — мерчант без своей категории (банки: перевод в банк ещё не говорит, на что ушли деньги).
export const merchantDictionary = pgTable("merchant_dictionary", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  pattern: varchar("pattern", { length: 120 }).notNull(),
  op: varchar("op", { length: 11 }).notNull(), // contains | starts_with | regex
  merchantName: varchar("merchant_name", { length: 120 }).notNull(),
  categoryCode: varchar("category_code", { length: 50 }),
  priority: integer("priority").notNull().default(100),
}, (table) => ({
  patternUq: uniqueIndex("merchant_dictionary_pattern_uq").on(table.pattern, table.op),
  opCheck: check("merchant_dictionary_op_check", sql`${table.op} in ('contains', 'starts_with', 'regex')`),
}));

// Курсы ЦБ за 1 единицу валюты (Value / Nominal из XML ЦБ) — для amount_rub и общего баланса в рублях (E1.1-T2)
export const fxRates = pgTable("fx_rates", {
  date: date("date").notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  rateRub: decimal("rate_rub", { precision: 18, scale: 6 }).notNull(),
  source: varchar("source", { length: 10 }).notNull().default("cbr"),
}, (table) => ({
  pk: primaryKey({ columns: [table.date, table.currency] }),
}));

export type FxRate = typeof fxRates.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type UserCategoryPref = typeof userCategoryPrefs.$inferSelect;

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
