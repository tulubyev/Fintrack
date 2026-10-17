import type { 
  User, InsertUser,
  BankConnection, InsertBankConnection,
  Account, InsertAccount,
  Transaction, InsertTransaction,
  SavingsGoal, InsertSavingsGoal,
  Budget, InsertBudget,
  AiChatSession, InsertAiChatSession,
  FamilyGroup, InsertFamilyGroup,
  FamilyGroupMember, InsertFamilyGroupMember,
  AdminLog, InsertAdminLog,
  Document, InsertDocument,
  DocumentType,
  DocumentVerificationHistory
} from "@shared/schema";

export interface IUserStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  getUserByIdentifier(identifier: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | undefined>;
  
  getAiChatSessions(userId: string): Promise<AiChatSession[]>;
  createAiChatSession(session: InsertAiChatSession): Promise<AiChatSession>;
  updateAiChatSession(id: string, updates: Partial<AiChatSession>): Promise<AiChatSession | undefined>;
  
  getFamilyGroupsByAdmin(adminUserId: string): Promise<FamilyGroup[]>;
  createFamilyGroup(group: InsertFamilyGroup): Promise<FamilyGroup>;
  addFamilyGroupMember(member: InsertFamilyGroupMember): Promise<FamilyGroupMember>;
  
  getAccountsByUser(userId: string): Promise<Account[]>;
  getTransactionsByUser(userId: string): Promise<Transaction[]>;
  deleteUserData(userId: string): Promise<void>;
  
  getUserBySnils?(snils: string): Promise<User | undefined>;
  getUserByEsiaOid?(esiaOid: string): Promise<User | undefined>;
}

export interface IBankStorage {
  getBankConnections(userId: string): Promise<BankConnection[]>;
  getBankConnection(id: string): Promise<BankConnection | undefined>;
  createBankConnection(connection: InsertBankConnection): Promise<BankConnection>;
  updateBankConnection(id: string, updates: Partial<BankConnection>): Promise<BankConnection | undefined>;
  
  getAccounts(userId: string): Promise<Account[]>;
  getAccountsByBank(bankConnectionId: string): Promise<Account[]>;
  createAccount(account: InsertAccount): Promise<Account>;
  createOrUpdateAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: string, updates: Partial<Account>): Promise<Account | undefined>;
  
  getTotalBalance(userId: string): Promise<string>;
}

export interface ITransactionStorage {
  getTransactions(userId: string, limit?: number): Promise<Transaction[]>;
  getTransactionsByAccount(accountId: string, limit?: number): Promise<Transaction[]>;
  getTransactionsByCategory(userId: string, category: string, fromDate?: Date, toDate?: Date): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | undefined>;
  
  getSavingsGoals(userId: string): Promise<SavingsGoal[]>;
  createSavingsGoal(goal: InsertSavingsGoal): Promise<SavingsGoal>;
  updateSavingsGoal(id: string, updates: Partial<SavingsGoal>): Promise<SavingsGoal | undefined>;
  
  getBudgets(userId: string, month: number, year: number): Promise<Budget[]>;
  createBudget(budget: InsertBudget): Promise<Budget>;
  updateBudget(id: string, updates: Partial<Budget>): Promise<Budget | undefined>;
}

export interface IDocumentStorage {
  getDocumentTypes(): Promise<DocumentType[]>;
  getUserDocuments(userId: string, status?: string): Promise<Document[]>;
  getDocuments(userId: string): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
  getDocumentById(documentId: string): Promise<any | null>;
  getPendingDocuments(): Promise<any[]>;
  getArchivedDocuments(): Promise<any[]>;
  createDocument(doc: InsertDocument): Promise<Document>;
  updateDocument(id: string, updates: Partial<Document>): Promise<Document | undefined>;
  updateDocumentStatus(id: string, newStatus: string, changedBy: string | null, changeReason?: string, verificationNotes?: string, extractedData?: any): Promise<Document | undefined>;
  getDocumentVerificationHistory(documentId: string): Promise<DocumentVerificationHistory[]>;
  getVerificationHistory(documentId: string): Promise<DocumentVerificationHistory[]>;
  createVerificationHistoryEntry(entry: { documentId: string; status: string; verifiedBy: string; verifiedAt: Date; reason?: string }): Promise<DocumentVerificationHistory>;
  deleteDocument(id: string): Promise<boolean>;
  updateUserVerificationStatus(userId: string): Promise<void>;
  getDocumentsWithUserInfo(): Promise<any[]>;
  getArchivedDocumentsWithUserInfo(): Promise<any[]>;
}

export interface IAdminStorage {
  createAdminLog(log: InsertAdminLog): Promise<AdminLog>;
  getAdminLogs(adminUserId?: string, options?: { limit?: number; page?: number }): Promise<AdminLog[]>;
  getAdminStats(): Promise<any>;
  getUserAnalytics(): Promise<any>;
  getFinancialOverview(): Promise<any>;
  
  getTotalUsersCount(): Promise<number>;
  getNewUsersCount(date: Date): Promise<number>;
  getPendingDocumentsCount(): Promise<number>;
  
  getAllUsers(page?: number, limit?: number, search?: string): Promise<any>;
  getAllUsersForAdmin(): Promise<User[]>;
  getUserDetails(userId: string): Promise<any>;
  updateUserByAdmin(userId: string, updates: Partial<User>): Promise<User | undefined>;
  deleteUserByAdmin(userId: string): Promise<void>;
  
  getRecentLogs(limit?: number): Promise<any[]>;
  getSystemMetrics(): Promise<any>;
  getSystemHealth(): Promise<any>;
  getApiStatus(): Promise<any>;
  getSecurityOverview(): Promise<any>;
}
