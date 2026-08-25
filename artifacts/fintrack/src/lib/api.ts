import { apiRequest } from "./queryClient";
import { configService } from "../services/configService";
import type { 
  User, 
  AuthTokens, 
  BankConnection, 
  Account, 
  Transaction, 
  SavingsGoal, 
  Budget, 
  DashboardStats, 
  SpendingCategory,
  AiChatSession 
} from "../types";

// Helper to get endpoints from config with fallback
const getEndpoints = async (): Promise<any> => {
  try {
    const config = await configService.getConfig();
    return config.api.endpoints;
  } catch (error) {
    console.warn('Failed to load config endpoints, using fallback');
    return {
      auth: {
        register: '/api/auth/register',
        login: '/api/auth/login',
        refresh: '/api/auth/refresh',
        logout: '/api/auth/logout',
        gosuslugi: '/api/auth/gosuslugi',
        verify: '/api/auth/verify'
      },
      dashboard: {
        stats: '/api/dashboard/stats',
        spendingCategories: '/api/dashboard/spending-categories'
      },
      banks: {
        connections: '/api/banks/connections',
        connect: '/api/banks/connect',
        oauthCallback: '/api/banks/oauth-callback',
        available: '/api/banks/available',
        realConnect: '/api/banks/real-connect',
        sync: '/api/banks/sync'
      },
      profile: {
        uploadImage: '/api/profile/upload-image'
      },
      verification: {
        sendSms: '/api/verification/send-sms',
        sendEmail: '/api/verification/send-email',
        verifySms: '/api/verification/verify-sms',
        verifyEmail: '/api/verification/verify-email'
      },
      accounts: '/api/accounts',
      transactions: '/api/transactions',
      savingsGoals: '/api/savings-goals',
      budgets: '/api/budgets',
      ai: '/api/ai',
      documents: '/api/documents',
      esia: {
        auth: '/api/auth/esia'
      }
    };
  }
};

// Auth API
export const authAPI = {
  register: async (data: {
    email?: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
  }): Promise<{ user: User; accessToken: string }> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("POST", endpoints.auth.register, data);
    return await res.json();
  },

  login: async (identifier: string, password: string): Promise<{ user: User; accessToken: string }> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("POST", endpoints.auth.login, { identifier, password });
    return await res.json();
  },

  refreshToken: async (): Promise<{ accessToken: string; user: User }> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("POST", endpoints.auth.refresh);
    return await res.json();
  },

  logout: async (): Promise<void> => {
    const endpoints: any = await getEndpoints();
    await apiRequest("POST", endpoints.auth.logout);
  },

  gosuslugiAuth: async (code: string): Promise<{ user: User; accessToken: string }> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("POST", endpoints.auth.gosuslugi, { code });
    return await res.json();
  },
};

// Dashboard API
export const dashboardAPI = {
  getStats: async (): Promise<DashboardStats> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("GET", endpoints.dashboard.stats);
    return await res.json();
  },

  getSpendingCategories: async (): Promise<SpendingCategory[]> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("GET", endpoints.dashboard.spendingCategories);
    return await res.json();
  },
};

// Bank API
export const bankAPI = {
  getConnections: async (): Promise<BankConnection[]> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("GET", endpoints.banks.connections);
    return await res.json();
  },

  initiateConnection: async (bankCode: string): Promise<{ redirectUrl: string; consentId: string }> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("POST", endpoints.banks.connect, { bankCode });
    return await res.json();
  },

  handleOAuthCallback: async (consentId: string, authCode: string): Promise<{ success: boolean; connectionId: string }> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("POST", endpoints.banks.oauthCallback, { consentId, authCode });
    return await res.json();
  },

  disconnectBank: async (connectionId: string): Promise<void> => {
    const endpoints: any = await getEndpoints();
    await apiRequest("DELETE", `${endpoints.banks.connections}/${connectionId}`);
  },
};

// Account API
export const accountAPI = {
  getAccounts: async (): Promise<Account[]> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("GET", endpoints.accounts);
    return await res.json();
  },
};

// Transaction API
export const transactionAPI = {
  getTransactions: async (limit?: number): Promise<Transaction[]> => {
    const endpoints: any = await getEndpoints();
    const url = limit ? `${endpoints.transactions}?limit=${limit}` : endpoints.transactions;
    const res = await apiRequest("GET", url);
    return await res.json();
  },
};

// Savings Goals API
export const savingsAPI = {
  getGoals: async (): Promise<SavingsGoal[]> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("GET", endpoints.savingsGoals);
    return await res.json();
  },

  createGoal: async (data: {
    name: string;
    description?: string;
    targetAmount: string;
    targetDate?: string;
  }): Promise<SavingsGoal> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("POST", endpoints.savingsGoals, data);
    return await res.json();
  },

  updateGoal: async (goalId: string, updates: Partial<SavingsGoal>): Promise<SavingsGoal> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("PATCH", `${endpoints.savingsGoals}/${goalId}`, updates);
    return await res.json();
  },
};

// Budget API
export const budgetAPI = {
  getBudgets: async (month?: number, year?: number): Promise<Budget[]> => {
    const endpoints: any = await getEndpoints();
    let url = endpoints.budgets;
    if (month && year) {
      url += `?month=${month}&year=${year}`;
    }
    const res = await apiRequest("GET", url);
    return await res.json();
  },

  createBudget: async (data: {
    category: string;
    monthlyLimit: string;
    month: number;
    year: number;
  }): Promise<Budget> => {
    const endpoints: any = await getEndpoints();
    const res = await apiRequest("POST", endpoints.budgets, data);
    return await res.json();
  },
};

// AI API
export const aiAPI = {
  createChatSession: async (): Promise<AiChatSession> => {
    const res = await apiRequest("POST", "/api/ai/chat/session");
    return await res.json();
  },

  sendMessage: async (sessionId: string, message: string): Promise<{ reply: string }> => {
    const res = await apiRequest("POST", "/api/ai/chat/message", { sessionId, message });
    return await res.json();
  },

  getInsights: async (): Promise<{ insights: string }> => {
    const res = await apiRequest("GET", "/api/ai/insights");
    return await res.json();
  },

  getChatSessions: async (): Promise<AiChatSession[]> => {
    const res = await apiRequest("GET", "/api/ai/chat/sessions");
    return await res.json();
  },

  getBalance: async (): Promise<{ balance: number; balanceFormatted: string; status: string }> => {
    const res = await apiRequest("GET", "/api/ai/balance");
    return await res.json();
  },
};
