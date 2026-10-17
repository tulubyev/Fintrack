import { storage } from "../storage";
import { cryptoService } from "./cryptoService";
import type { BankConnection, Account, Transaction, InsertBankConnection, InsertAccount, InsertTransaction } from "@shared/schema";

interface BankAPIResponse {
  accounts: any[];
  transactions: any[];
}

interface CategoryMapping {
  [key: string]: string;
}

export class BankService {
  private readonly categoryMapping: CategoryMapping = {
    'grocery': 'продукты',
    'restaurant': 'рестораны',
    'gas': 'транспорт',
    'transport': 'транспорт',
    'entertainment': 'развлечения',
    'utilities': 'коммуналка',
    'shopping': 'покупки',
    'healthcare': 'здоровье',
    'education': 'образование',
    'salary': 'зарплата',
    'transfer': 'переводы',
  };

  private readonly bankConfigs = {
    sberbank: {
      name: 'Сбербанк',
      apiUrl: 'https://api.sberbank.ru/openbanking',
    },
    vtb: {
      name: 'ВТБ',
      apiUrl: 'https://api.vtb.ru/openbanking',
    },
    tinkoff: {
      name: 'Тинькофф',
      apiUrl: 'https://api.tinkoff.ru/openbanking',
    },
  };

  async initiateOAuth(userId: string, bankCode: string): Promise<{ redirectUrl: string; consentId: string }> {
    const bankConfig = this.bankConfigs[bankCode as keyof typeof this.bankConfigs];
    if (!bankConfig) {
      throw new Error('Неподдерживаемый банк');
    }

    // For MVP, generate mock consent ID and redirect URL
    const consentId = `consent_${bankCode}_${Date.now()}`;
    const redirectUrl = `${bankConfig.apiUrl}/oauth/authorize?consent_id=${consentId}&client_id=fintrack&response_type=code&scope=accounts+transactions`;

    // Store pending connection
    await storage.createBankConnection({
      userId,
      bankCode,
      bankName: bankConfig.name,
      consentId,
      status: 'pending',
    });

    return { redirectUrl, consentId };
  }

  async handleOAuthCallback(consentId: string, authCode: string): Promise<BankConnection> {
    // Find the pending connection
    const connections = await storage.getBankConnections(''); // We'll need to modify this to search by consentId
    const connection = connections.find(c => c.consentId === consentId);
    
    if (!connection) {
      throw new Error('Согласие не найдено');
    }

    // For MVP, simulate token exchange
    const mockTokens = {
      accessToken: `access_${authCode}_${Date.now()}`,
      refreshToken: `refresh_${authCode}_${Date.now()}`,
    };

    // Encrypt tokens before storage
    const encryptedAccessToken = cryptoService.encrypt(mockTokens.accessToken);
    const encryptedRefreshToken = cryptoService.encrypt(mockTokens.refreshToken);

    // Update connection with tokens
    const updatedConnection = await storage.updateBankConnection(connection.id, {
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      status: 'active',
      lastSyncAt: new Date(),
    });

    if (!updatedConnection) {
      throw new Error('Не удалось обновить подключение');
    }

    // Sync initial data
    await this.syncBankData(updatedConnection);

    return updatedConnection;
  }

  async syncBankData(connection: BankConnection): Promise<void> {
    if (!connection.accessToken) {
      throw new Error('Отсутствует токен доступа');
    }

    const decryptedToken = cryptoService.decrypt(connection.accessToken);
    
    try {
      // For MVP, generate mock data instead of real API calls
      const mockData = this.generateMockBankData(connection.bankCode);
      
      // Sync accounts
      await this.syncAccounts(connection, mockData.accounts);
      
      // Sync transactions
      await this.syncTransactions(connection, mockData.transactions);

      // Update last sync time
      await storage.updateBankConnection(connection.id, {
        lastSyncAt: new Date(),
      });
    } catch (error) {
      console.error(`Error syncing data for bank ${connection.bankCode}:`, error);
      
      // Update connection status if error indicates token issues
      if (error instanceof Error && error.message.includes('token')) {
        await storage.updateBankConnection(connection.id, {
          status: 'expired',
        });
      }
      
      throw error;
    }
  }

  private async syncAccounts(connection: BankConnection, accountsData: any[]): Promise<void> {
    for (const accountData of accountsData) {
      const existingAccounts = await storage.getAccountsByBank(connection.id);
      const existingAccount = existingAccounts.find(
        acc => acc.externalAccountId === accountData.id
      );

      if (existingAccount) {
        // Update existing account
        await storage.updateAccount(existingAccount.id, {
          balance: accountData.balance.toString(),
          accountName: accountData.name,
        });
      } else {
        // Create new account
        const newAccount: InsertAccount = {
          userId: connection.userId,
          bankConnectionId: connection.id,
          externalAccountId: accountData.id,
          accountType: accountData.type,
          accountName: accountData.name,
          balance: accountData.balance.toString(),
          currency: accountData.currency || 'RUB',
        };

        await storage.createAccount(newAccount);
      }
    }
  }

  private async syncTransactions(connection: BankConnection, transactionsData: any[]): Promise<void> {
    const accounts = await storage.getAccountsByBank(connection.id);

    for (const transactionData of transactionsData) {
      const account = accounts.find(acc => acc.externalAccountId === transactionData.accountId);
      if (!account) continue;

      // Check if transaction already exists
      const existingTransactions = await storage.getTransactionsByAccount(account.id, 1000);
      const existingTransaction = existingTransactions.find(
        tx => tx.externalTransactionId === transactionData.id
      );

      if (!existingTransaction) {
        const category = this.categorizeTransaction(transactionData.description, transactionData.merchant);
        
        const newTransaction: InsertTransaction = {
          userId: connection.userId,
          accountId: account.id,
          externalTransactionId: transactionData.id,
          amount: transactionData.amount.toString(),
          currency: transactionData.currency || 'RUB',
          description: transactionData.description,
          merchant: transactionData.merchant,
          category,
          transactionDate: new Date(transactionData.date),
          metadata: {
            bankCode: connection.bankCode,
            rawData: transactionData,
          },
        };

        await storage.createTransaction(newTransaction);
      }
    }
  }

  private categorizeTransaction(description: string, merchant?: string): string {
    const text = `${description} ${merchant || ''}`.toLowerCase();

    // Simple keyword-based categorization
    if (text.includes('пятёрочка') || text.includes('магнит') || text.includes('атак') || text.includes('продукт')) {
      return 'продукты';
    }
    if (text.includes('заправ') || text.includes('азс') || text.includes('газ') || text.includes('бензин')) {
      return 'транспорт';
    }
    if (text.includes('ресторан') || text.includes('кафе') || text.includes('макдональдс') || text.includes('kfc')) {
      return 'рестораны';
    }
    if (text.includes('кино') || text.includes('театр') || text.includes('развлечения')) {
      return 'развлечения';
    }
    if (text.includes('коммунальн') || text.includes('жкх') || text.includes('электро') || text.includes('газпром')) {
      return 'коммуналка';
    }
    if (text.includes('зарплата') || text.includes('salary') || description.includes('Начисление заработной платы')) {
      return 'зарплата';
    }
    if (text.includes('перевод') || text.includes('transfer')) {
      return 'переводы';
    }

    return 'прочее';
  }

  private generateMockBankData(bankCode: string): BankAPIResponse {
    const now = new Date();
    const accounts = [
      {
        id: `acc_${bankCode}_1`,
        name: 'Основная карта',
        type: 'checking',
        balance: Math.floor(Math.random() * 500000) + 50000,
        currency: 'RUB',
      },
      {
        id: `acc_${bankCode}_2`,
        name: 'Накопительный счет',
        type: 'savings',
        balance: Math.floor(Math.random() * 200000) + 20000,
        currency: 'RUB',
      },
    ];

    const transactions = [];
    for (let i = 0; i < 50; i++) {
      const days = Math.floor(Math.random() * 30);
      const date = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      
      const isIncome = Math.random() < 0.1; // 10% chance of income
      const amount = isIncome 
        ? Math.floor(Math.random() * 150000) + 50000 // Income: 50k-200k
        : -(Math.floor(Math.random() * 5000) + 100); // Expense: 100-5100

      const mockTransactions = [
        { description: 'Пятёрочка', merchant: 'Пятёрочка', category: 'продукты' },
        { description: 'АЗС Shell', merchant: 'Shell', category: 'транспорт' },
        { description: 'Кинотеатр IMAX', merchant: 'IMAX', category: 'развлечения' },
        { description: 'Ресторан Пушкин', merchant: 'Пушкин', category: 'рестораны' },
        { description: 'ЖКХ Москва', merchant: 'ЖКХ', category: 'коммуналка' },
        { description: 'Зарплата', merchant: 'Работодатель', category: 'зарплата' },
      ];

      const randomTransaction = isIncome 
        ? { description: 'Зарплата', merchant: 'Работодатель', category: 'зарплата' }
        : mockTransactions[Math.floor(Math.random() * mockTransactions.length)];

      transactions.push({
        id: `tx_${bankCode}_${i}`,
        accountId: accounts[Math.floor(Math.random() * accounts.length)].id,
        amount,
        currency: 'RUB',
        description: randomTransaction.description,
        merchant: randomTransaction.merchant,
        date: date.toISOString(),
      });
    }

    return { accounts, transactions };
  }

  async disconnectBank(userId: string, bankConnectionId: string): Promise<void> {
    const existing = await storage.getBankConnection(bankConnectionId);
    if (!existing || existing.userId !== userId) {
      throw new Error('Подключение не найдено');
    }

    const connection = await storage.updateBankConnection(bankConnectionId, {
      status: 'revoked',
    });

    if (!connection) {
      throw new Error('Подключение не найдено');
    }

    // Deactivate associated accounts
    const accounts = await storage.getAccountsByBank(bankConnectionId);
    for (const account of accounts) {
      await storage.updateAccount(account.id, {
        isActive: false,
      });
    }
  }

  async refreshBankConnection(connectionId: string): Promise<void> {
    // This would typically refresh the OAuth token
    // For MVP, just update the last sync time
    await storage.updateBankConnection(connectionId, {
      lastSyncAt: new Date(),
    });
  }
}

export const bankService = new BankService();
