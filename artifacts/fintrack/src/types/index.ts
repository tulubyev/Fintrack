export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role?: 'user' | 'admin';
  adminRole?: 'super_admin' | 'devops_admin' | 'analytics_admin' | 'finance_admin' | 'api_admin' | 'security_admin';
  isEmailVerified?: boolean;
  isPhoneVerified?: boolean;
  twoFactorEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string;
}

export interface BankConnection {
  id: string;
  bankCode: string;
  bankName: string;
  status: 'active' | 'expired' | 'revoked' | 'pending';
  lastSyncAt?: string;
  createdAt: string;
}

export interface Account {
  id: string;
  bankConnectionId: string;
  externalAccountId: string;
  accountType: 'checking' | 'savings' | 'credit';
  accountName: string;
  balance: string;
  currency: string;
  isActive: boolean;
  lastUpdatedAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  externalTransactionId?: string;
  amount: string;
  currency: string;
  description: string;
  merchant?: string;
  category?: string;
  subcategory?: string;
  transactionDate: string;
  processingDate: string;
  isRecurring: boolean;
  metadata?: any;
}

export interface SavingsGoal {
  id: string;
  name: string;
  description?: string;
  targetAmount: string;
  currentAmount: string;
  targetDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Budget {
  id: string;
  category: string;
  monthlyLimit: string;
  currentSpent: string;
  month: number;
  year: number;
  isActive: boolean;
}

export interface DashboardStats {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  totalSavings: number;
  savingsGoalsCount: number;
}

export interface SpendingCategory {
  category: string;
  total: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface AiChatSession {
  id: string;
  sessionId: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
