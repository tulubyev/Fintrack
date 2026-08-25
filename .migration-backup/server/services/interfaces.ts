import type { 
  User, 
  BankConnection, 
  Account, 
  Transaction, 
  SavingsGoal, 
  Budget,
  Document,
  AiChatSession,
  FamilyGroup
} from "@shared/schema";

/**
 * ДОМЕННЫЕ ИНТЕРФЕЙСЫ ДЛЯ СЕРВИСОВ
 * Разделение IStorage на специализированные интерфейсы
 */

// ===========================================
// USER SERVICE INTERFACES
// ===========================================

export interface IUserService {
  // Профиль пользователя (агрегированные данные)
  getUserProfile(userId: string): Promise<UserProfile>;
  updateUserProfile(userId: string, updates: ProfileUpdates): Promise<User>;
  
  // Аутентификация и безопасность
  verifyUserCredentials(identifier: string, password: string): Promise<AuthResult>;
  changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void>;
  
  // Верификация пользователя
  initiateUserVerification(userId: string): Promise<VerificationProcess>;
  completeUserVerification(userId: string, verificationData: any): Promise<VerificationResult>;
}

export interface UserProfile {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  role: string;
  planType: string;
  isVerified: boolean;
  documentsVerified: boolean;
  banksConnected: number;
  totalBalance: string;
  createdAt: Date;
}

export interface ProfileUpdates {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResult {
  user: User;
  token: string;
  refreshToken?: string;
}

export interface VerificationProcess {
  processId: string;
  requiredDocuments: string[];
  status: 'pending' | 'in_progress' | 'completed';
}

export interface VerificationResult {
  success: boolean;
  verificationLevel: 'basic' | 'standard' | 'enhanced';
  message: string;
}

// ===========================================
// BANK SERVICE INTERFACES  
// ===========================================

export interface IBankService {
  // Подключение банков
  connectBank(userId: string, bankCode: string, credentials: BankCredentials): Promise<BankConnection>;
  disconnectBank(userId: string, connectionId: string): Promise<void>;
  
  // Синхронизация данных
  syncBankData(connectionId: string): Promise<SyncResult>;
  syncAllUserBanks(userId: string): Promise<SyncResult[]>;
  
  // Управление подключениями
  getUserBankConnections(userId: string): Promise<BankConnectionInfo[]>;
  refreshBankConnection(connectionId: string): Promise<BankConnection>;
}

export interface BankCredentials {
  bankCode: string;
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  // Другие поля в зависимости от банка
}

export interface BankConnectionInfo extends BankConnection {
  accountsCount: number;
  lastSyncAt: Date | null;
  syncStatus: 'success' | 'error' | 'in_progress';
  totalBalance: string;
}

export interface SyncResult {
  success: boolean;
  accountsSynced: number;
  transactionsSynced: number;
  errors: string[];
  lastSyncAt: Date;
}

// ===========================================
// TRANSACTION SERVICE INTERFACES
// ===========================================

export interface ITransactionService {
  // Получение транзакций
  getUserTransactions(userId: string, filters?: TransactionFilters): Promise<Transaction[]>;
  getTransactionsByCategory(userId: string, category: string, period?: DatePeriod): Promise<Transaction[]>;
  
  // Аналитика транзакций
  getSpendingAnalytics(userId: string, period: DatePeriod): Promise<SpendingAnalytics>;
  getCategoryBreakdown(userId: string, period: DatePeriod): Promise<CategoryBreakdown[]>;
  
  // Управление транзакциями
  categorizeTransaction(transactionId: string, category: string): Promise<Transaction>;
  addTransactionNote(transactionId: string, note: string): Promise<Transaction>;
}

export interface TransactionFilters {
  accountId?: string;
  category?: string;
  minAmount?: number;
  maxAmount?: number;
  dateFrom?: Date;
  dateTo?: Date;
  type?: 'income' | 'expense';
}

export interface DatePeriod {
  startDate: Date;
  endDate: Date;
}

export interface SpendingAnalytics {
  totalIncome: string;
  totalExpenses: string;
  netFlow: string;
  averageTransaction: string;
  transactionCount: number;
  topCategories: CategoryBreakdown[];
}

export interface CategoryBreakdown {
  category: string;
  amount: string;
  transactionCount: number;
  percentage: number;
}

// ===========================================
// BUDGET SERVICE INTERFACES
// ===========================================

export interface IBudgetService {
  // Управление бюджетами
  getUserBudgets(userId: string, month: number, year: number): Promise<BudgetInfo[]>;
  createBudget(userId: string, budgetData: CreateBudgetData): Promise<Budget>;
  updateBudget(budgetId: string, updates: Partial<Budget>): Promise<Budget>;
  
  // Цели накоплений
  getUserSavingsGoals(userId: string): Promise<SavingsGoalInfo[]>;
  createSavingsGoal(userId: string, goalData: CreateSavingsGoalData): Promise<SavingsGoal>;
  updateSavingsGoal(goalId: string, progress: number): Promise<SavingsGoal>;
  
  // Аналитика бюджета
  getBudgetAnalytics(userId: string, month: number, year: number): Promise<BudgetAnalytics>;
}

export interface BudgetInfo extends Budget {
  spent: string;
  remaining: string;
  percentageUsed: number;
  status: 'on_track' | 'over_budget' | 'warning';
}

export interface CreateBudgetData {
  category: string;
  amount: number;
  month: number;
  year: number;
}

export interface SavingsGoalInfo extends SavingsGoal {
  progressPercentage: number;
  monthlyTarget: string;
  estimatedCompletion: Date | null;
}

export interface CreateSavingsGoalData {
  name: string;
  targetAmount: number;
  targetDate: Date;
  description?: string;
}

export interface BudgetAnalytics {
  totalBudget: string;
  totalSpent: string;
  budgetUtilization: number;
  overBudgetCategories: string[];
  savingsRate: number;
}

// ===========================================
// DOCUMENT SERVICE INTERFACES
// ===========================================

export interface IDocumentService {
  // Управление документами
  getUserDocuments(userId: string, status?: string): Promise<DocumentInfo[]>;
  uploadDocument(userId: string, documentData: UploadDocumentData): Promise<Document>;
  
  // Верификация документов
  submitForVerification(documentId: string): Promise<void>;
  getVerificationStatus(documentId: string): Promise<VerificationStatus>;
  
  // Админ функции
  getPendingDocuments(): Promise<DocumentInfo[]>;
  approveDocument(documentId: string, adminId: string): Promise<Document>;
  rejectDocument(documentId: string, adminId: string, reason: string): Promise<Document>;
}

export interface DocumentInfo extends Document {
  typeName: string;
  isRequired: boolean;
  verificationHistory: VerificationHistoryItem[];
}

export interface UploadDocumentData {
  documentTypeId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  encryptedContent: Buffer;
}

export interface VerificationStatus {
  status: 'pending' | 'verified' | 'rejected';
  verifiedAt: Date | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
}

export interface VerificationHistoryItem {
  action: string;
  performedBy: string;
  performedAt: Date;
  reason?: string;
}

// ===========================================
// AI SERVICE INTERFACES
// ===========================================

export interface IAiService {
  // Чат с AI
  startChatSession(userId: string): Promise<AiChatSession>;
  sendMessage(sessionId: string, message: string): Promise<AiResponse>;
  getChatHistory(userId: string): Promise<AiChatSession[]>;
  
  // Финансовые инсайты
  getFinancialInsights(userId: string): Promise<FinancialInsight[]>;
  getBudgetRecommendations(userId: string): Promise<BudgetRecommendation[]>;
}

export interface AiResponse {
  message: string;
  timestamp: Date;
  confidence: number;
  suggestions?: string[];
}

export interface FinancialInsight {
  type: 'spending_pattern' | 'saving_opportunity' | 'budget_alert';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
}

export interface BudgetRecommendation {
  category: string;
  currentSpending: string;
  recommendedBudget: string;
  reasoning: string;
}

// ===========================================
// FINANCE SERVICE INTERFACES (ДОБАВЛЕНО)
// ===========================================

export interface IFinanceService {
  getUserFinancialSummary(userId: string): Promise<FinancialSummary>;
  createTransaction(userId: string, transactionData: TransactionData): Promise<any>;
  getCategoryAnalysis(userId: string, period?: 'month' | 'quarter' | 'year'): Promise<CategoryAnalysis[]>;
  generateBudgetForecast(userId: string): Promise<any>;
  optimizeSubscriptions(userId: string): Promise<any>;
}

export interface TransactionData {
  accountId: string;
  amount: number;
  description: string;
  category?: string;
  merchantName?: string;
  location?: string;
  isRecurring?: boolean;
  tags?: string[];
}

export interface FinancialSummary {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savingsGoalProgress: number;
  investmentReturn: number;
  connectedBanks: number;
  activeInvestments: number;
  recentTransactionsCount: number;
  lastUpdated: Date;
}

export interface CategoryAnalysis {
  category: string;
  totalAmount: number;
  transactionCount: number;
  averageAmount: number;
  percentage: number;
  trend: 'up' | 'down' | 'stable';
}

// ===========================================
// ADMIN SERVICE INTERFACES (ДОБАВЛЕНО)
// ===========================================

export interface IAdminService {
  getAdminDashboardData(adminUserId: string): Promise<AdminDashboardData>;
  moderateUser(adminUserId: string, targetUserId: string, action: string, reason?: string): Promise<UserModerationData>;
  manageAdminRole(superAdminId: string, targetUserId: string, newRole: any): Promise<void>;
  getAdminAuditLog(adminUserId: string, filters?: any): Promise<any[]>;
  getSystemHealth(): Promise<SystemHealthData>;
  bulkUserOperation(adminUserId: string, userIds: string[], operation: string, params?: any): Promise<any>;
}

export interface AdminDashboardData {
  totalUsers: number;
  newUsersToday: number;
  pendingDocuments: number;
  systemHealth: any;
  usersByRole: Record<string, number>;
  financialStats: any;
  recentLogs: any[];
  lastUpdated: Date;
}

export interface UserModerationData {
  success: boolean;
  action: string;
  targetUser: string;
  reason: string;
  timestamp: Date;
}

export interface SystemHealthData {
  overall: 'healthy' | 'warning' | 'error';
  database: 'healthy' | 'warning' | 'error';
  storage: 'healthy' | 'warning' | 'error';
  api: 'healthy' | 'warning' | 'error';
  performance: any;
  lastCheck: Date;
}