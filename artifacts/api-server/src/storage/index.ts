import { UserStorage } from "./UserStorage";
import { BankStorage } from "./BankStorage";
import { TransactionStorage } from "./TransactionStorage";
import { DocumentStorage } from "./DocumentStorage";
import { AdminStorage } from "./AdminStorage";
import type { IUserStorage, IBankStorage, ITransactionStorage, IDocumentStorage, IAdminStorage } from "./types";

export interface IStorage extends IUserStorage, IBankStorage, ITransactionStorage, IDocumentStorage, IAdminStorage {}

export class DatabaseStorage implements IStorage {
  private userStorage: UserStorage;
  private bankStorage: BankStorage;
  private transactionStorage: TransactionStorage;
  private documentStorage: DocumentStorage;
  private adminStorage: AdminStorage;

  constructor() {
    this.userStorage = new UserStorage();
    this.bankStorage = new BankStorage();
    this.transactionStorage = new TransactionStorage();
    this.documentStorage = new DocumentStorage();
    this.adminStorage = new AdminStorage();
  }

  getUser(...args: Parameters<UserStorage['getUser']>) { return this.userStorage.getUser(...args); }
  getUserByEmail(...args: Parameters<UserStorage['getUserByEmail']>) { return this.userStorage.getUserByEmail(...args); }
  getUserByPhone(...args: Parameters<UserStorage['getUserByPhone']>) { return this.userStorage.getUserByPhone(...args); }
  getUserByIdentifier(...args: Parameters<UserStorage['getUserByIdentifier']>) { return this.userStorage.getUserByIdentifier(...args); }
  createUser(...args: Parameters<UserStorage['createUser']>) { return this.userStorage.createUser(...args); }
  updateUser(...args: Parameters<UserStorage['updateUser']>) { return this.userStorage.updateUser(...args); }
  getAiChatSessions(...args: Parameters<UserStorage['getAiChatSessions']>) { return this.userStorage.getAiChatSessions(...args); }
  createAiChatSession(...args: Parameters<UserStorage['createAiChatSession']>) { return this.userStorage.createAiChatSession(...args); }
  updateAiChatSession(...args: Parameters<UserStorage['updateAiChatSession']>) { return this.userStorage.updateAiChatSession(...args); }
  getFamilyGroupsByAdmin(...args: Parameters<UserStorage['getFamilyGroupsByAdmin']>) { return this.userStorage.getFamilyGroupsByAdmin(...args); }
  createFamilyGroup(...args: Parameters<UserStorage['createFamilyGroup']>) { return this.userStorage.createFamilyGroup(...args); }
  addFamilyGroupMember(...args: Parameters<UserStorage['addFamilyGroupMember']>) { return this.userStorage.addFamilyGroupMember(...args); }
  getAccountsByUser(...args: Parameters<UserStorage['getAccountsByUser']>) { return this.userStorage.getAccountsByUser(...args); }
  getTransactionsByUser(...args: Parameters<UserStorage['getTransactionsByUser']>) { return this.userStorage.getTransactionsByUser(...args); }
  deleteUserData(...args: Parameters<UserStorage['deleteUserData']>) { return this.userStorage.deleteUserData(...args); }
  getUserBySnils(...args: Parameters<NonNullable<UserStorage['getUserBySnils']>>) { return this.userStorage.getUserBySnils?.(...args); }
  getUserByEsiaOid(...args: Parameters<NonNullable<UserStorage['getUserByEsiaOid']>>) { return this.userStorage.getUserByEsiaOid?.(...args); }

  getBankConnections(...args: Parameters<BankStorage['getBankConnections']>) { return this.bankStorage.getBankConnections(...args); }
  getBankConnection(...args: Parameters<BankStorage['getBankConnection']>) { return this.bankStorage.getBankConnection(...args); }
  createBankConnection(...args: Parameters<BankStorage['createBankConnection']>) { return this.bankStorage.createBankConnection(...args); }
  updateBankConnection(...args: Parameters<BankStorage['updateBankConnection']>) { return this.bankStorage.updateBankConnection(...args); }
  getAccounts(...args: Parameters<BankStorage['getAccounts']>) { return this.bankStorage.getAccounts(...args); }
  getAccountsByBank(...args: Parameters<BankStorage['getAccountsByBank']>) { return this.bankStorage.getAccountsByBank(...args); }
  createAccount(...args: Parameters<BankStorage['createAccount']>) { return this.bankStorage.createAccount(...args); }
  updateAccount(...args: Parameters<BankStorage['updateAccount']>) { return this.bankStorage.updateAccount(...args); }
  getTotalBalance(...args: Parameters<BankStorage['getTotalBalance']>) { return this.bankStorage.getTotalBalance(...args); }

  getTransactions(...args: Parameters<TransactionStorage['getTransactions']>) { return this.transactionStorage.getTransactions(...args); }
  getTransactionsByAccount(...args: Parameters<TransactionStorage['getTransactionsByAccount']>) { return this.transactionStorage.getTransactionsByAccount(...args); }
  getTransactionsByCategory(...args: Parameters<TransactionStorage['getTransactionsByCategory']>) { return this.transactionStorage.getTransactionsByCategory(...args); }
  getCashFlow(...args: Parameters<TransactionStorage['getCashFlow']>) { return this.transactionStorage.getCashFlow(...args); }
  createTransaction(...args: Parameters<TransactionStorage['createTransaction']>) { return this.transactionStorage.createTransaction(...args); }
  updateTransaction(...args: Parameters<TransactionStorage['updateTransaction']>) { return this.transactionStorage.updateTransaction(...args); }
  getSavingsGoals(...args: Parameters<TransactionStorage['getSavingsGoals']>) { return this.transactionStorage.getSavingsGoals(...args); }
  createSavingsGoal(...args: Parameters<TransactionStorage['createSavingsGoal']>) { return this.transactionStorage.createSavingsGoal(...args); }
  updateSavingsGoal(...args: Parameters<TransactionStorage['updateSavingsGoal']>) { return this.transactionStorage.updateSavingsGoal(...args); }

  getDocumentTypes(...args: Parameters<DocumentStorage['getDocumentTypes']>) { return this.documentStorage.getDocumentTypes(...args); }
  getUserDocuments(...args: Parameters<DocumentStorage['getUserDocuments']>) { return this.documentStorage.getUserDocuments(...args); }
  getDocuments(...args: Parameters<DocumentStorage['getDocuments']>) { return this.documentStorage.getDocuments(...args); }
  getDocument(...args: Parameters<DocumentStorage['getDocument']>) { return this.documentStorage.getDocument(...args); }
  getDocumentById(...args: Parameters<DocumentStorage['getDocumentById']>) { return this.documentStorage.getDocumentById(...args); }
  getPendingDocuments(...args: Parameters<DocumentStorage['getPendingDocuments']>) { return this.documentStorage.getPendingDocuments(...args); }
  getArchivedDocuments(...args: Parameters<DocumentStorage['getArchivedDocuments']>) { return this.documentStorage.getArchivedDocuments(...args); }
  createDocument(...args: Parameters<DocumentStorage['createDocument']>) { return this.documentStorage.createDocument(...args); }
  updateDocument(...args: Parameters<DocumentStorage['updateDocument']>) { return this.documentStorage.updateDocument(...args); }
  updateDocumentStatus(...args: Parameters<DocumentStorage['updateDocumentStatus']>) { return this.documentStorage.updateDocumentStatus(...args); }
  getDocumentVerificationHistory(...args: Parameters<DocumentStorage['getDocumentVerificationHistory']>) { return this.documentStorage.getDocumentVerificationHistory(...args); }
  getVerificationHistory(...args: Parameters<DocumentStorage['getVerificationHistory']>) { return this.documentStorage.getVerificationHistory(...args); }
  createVerificationHistoryEntry(...args: Parameters<DocumentStorage['createVerificationHistoryEntry']>) { return this.documentStorage.createVerificationHistoryEntry(...args); }
  deleteDocument(...args: Parameters<DocumentStorage['deleteDocument']>) { return this.documentStorage.deleteDocument(...args); }
  updateUserVerificationStatus(...args: Parameters<DocumentStorage['updateUserVerificationStatus']>) { return this.documentStorage.updateUserVerificationStatus(...args); }
  getDocumentsWithUserInfo(...args: Parameters<DocumentStorage['getDocumentsWithUserInfo']>) { return this.documentStorage.getDocumentsWithUserInfo(...args); }
  getArchivedDocumentsWithUserInfo(...args: Parameters<DocumentStorage['getArchivedDocumentsWithUserInfo']>) { return this.documentStorage.getArchivedDocumentsWithUserInfo(...args); }

  createAdminLog(...args: Parameters<AdminStorage['createAdminLog']>) { return this.adminStorage.createAdminLog(...args); }
  getAdminLogs(...args: Parameters<AdminStorage['getAdminLogs']>) { return this.adminStorage.getAdminLogs(...args); }
  getAdminStats(...args: Parameters<AdminStorage['getAdminStats']>) { return this.adminStorage.getAdminStats(...args); }
  getUserAnalytics(...args: Parameters<AdminStorage['getUserAnalytics']>) { return this.adminStorage.getUserAnalytics(...args); }
  getFinancialOverview(...args: Parameters<AdminStorage['getFinancialOverview']>) { return this.adminStorage.getFinancialOverview(...args); }
  getTotalUsersCount(...args: Parameters<AdminStorage['getTotalUsersCount']>) { return this.adminStorage.getTotalUsersCount(...args); }
  getNewUsersCount(...args: Parameters<AdminStorage['getNewUsersCount']>) { return this.adminStorage.getNewUsersCount(...args); }
  getPendingDocumentsCount(...args: Parameters<AdminStorage['getPendingDocumentsCount']>) { return this.adminStorage.getPendingDocumentsCount(...args); }
  getAllUsers(...args: Parameters<AdminStorage['getAllUsers']>) { return this.adminStorage.getAllUsers(...args); }
  getAllUsersForAdmin(...args: Parameters<AdminStorage['getAllUsersForAdmin']>) { return this.adminStorage.getAllUsersForAdmin(...args); }
  getUserDetails(...args: Parameters<AdminStorage['getUserDetails']>) { return this.adminStorage.getUserDetails(...args); }
  updateUserByAdmin(...args: Parameters<AdminStorage['updateUserByAdmin']>) { return this.adminStorage.updateUserByAdmin(...args); }
  deleteUserByAdmin(...args: Parameters<AdminStorage['deleteUserByAdmin']>) { return this.adminStorage.deleteUserByAdmin(...args); }
  getRecentLogs(...args: Parameters<AdminStorage['getRecentLogs']>) { return this.adminStorage.getRecentLogs(...args); }
  getSystemMetrics(...args: Parameters<AdminStorage['getSystemMetrics']>) { return this.adminStorage.getSystemMetrics(...args); }
  getSystemHealth(...args: Parameters<AdminStorage['getSystemHealth']>) { return this.adminStorage.getSystemHealth(...args); }
  getApiStatus(...args: Parameters<AdminStorage['getApiStatus']>) { return this.adminStorage.getApiStatus(...args); }
  getSecurityOverview(...args: Parameters<AdminStorage['getSecurityOverview']>) { return this.adminStorage.getSecurityOverview(...args); }
}

export const storage = new DatabaseStorage();
export type { IUserStorage, IBankStorage, ITransactionStorage, IDocumentStorage, IAdminStorage };
