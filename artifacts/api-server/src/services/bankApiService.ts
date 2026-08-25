import { storage } from "../storage";
import type { BankConnection, Account, Transaction } from "@shared/schema";

/**
 * Сервис для работы с API российских банков
 * Реализует интеграцию с ПКС и Открытыми API
 */

export interface BankApiCredentials {
  clientId: string;
  clientSecret: string;
  scope: string[];
  redirectUri: string;
}

export interface BankAccountInfo {
  accountId: string;
  accountType: 'checking' | 'savings' | 'credit';
  accountName: string;
  balance: number;
  currency: string;
  iban?: string;
  maskedNumber: string;
}

export interface BankTransactionInfo {
  transactionId: string;
  amount: number;
  currency: string;
  description: string;
  merchant?: string;
  category?: string;
  transactionDate: Date;
  type: 'debit' | 'credit';
}

/**
 * Базовый интерфейс для всех банковских API
 */
abstract class BaseBankAPI {
  protected bankCode: string;
  protected bankName: string;
  protected apiBaseUrl: string;
  protected credentials: BankApiCredentials;

  constructor(bankCode: string, bankName: string, apiBaseUrl: string, credentials: BankApiCredentials) {
    this.bankCode = bankCode;
    this.bankName = bankName;
    this.apiBaseUrl = apiBaseUrl;
    this.credentials = credentials;
  }

  /**
   * Инициация OAuth авторизации
   */
  abstract generateAuthUrl(state: string): string;

  /**
   * Обмен код авторизации на токен доступа
   */
  abstract exchangeCodeForToken(authCode: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>;

  /**
   * Обновление токена доступа
   */
  abstract refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>;

  /**
   * Получение списка счетов
   */
  abstract getAccounts(accessToken: string): Promise<BankAccountInfo[]>;

  /**
   * Получение транзакций по счету
   */
  abstract getTransactions(
    accessToken: string, 
    accountId: string, 
    fromDate?: Date, 
    toDate?: Date
  ): Promise<BankTransactionInfo[]>;

  /**
   * Получение баланса счета
   */
  abstract getAccountBalance(accessToken: string, accountId: string): Promise<number>;
}

/**
 * API Сбербанка
 */
class SberbankAPI extends BaseBankAPI {
  constructor(credentials: BankApiCredentials) {
    super('sberbank', 'Сбербанк', 'https://api.sberbank.ru', credentials);
  }

  generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.credentials.clientId,
      redirect_uri: this.credentials.redirectUri,
      scope: this.credentials.scope.join(' '),
      state: state,
    });

    return `${this.apiBaseUrl}/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(authCode: string) {
    const response = await fetch(`${this.apiBaseUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: this.credentials.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка обмена кода Сбербанк: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async refreshAccessToken(refreshToken: string) {
    const response = await fetch(`${this.apiBaseUrl}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.credentials.clientId}:${this.credentials.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка обновления токена Сбербанк: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async getAccounts(accessToken: string): Promise<BankAccountInfo[]> {
    const response = await fetch(`${this.apiBaseUrl}/v1/accounts`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Ошибка получения счетов Сбербанк: ${response.statusText}`);
    }

    const data = await response.json();
    return data.accounts.map((account: any) => ({
      accountId: account.resourceId,
      accountType: this.mapAccountType(account.cashAccountType),
      accountName: account.name || account.product || 'Банковский счет',
      balance: parseFloat(account.balances?.[0]?.balanceAmount?.amount || '0'),
      currency: account.balances?.[0]?.balanceAmount?.currency || 'RUB',
      maskedNumber: account.maskedPan || account.iban?.slice(-4) || '****',
    }));
  }

  async getTransactions(
    accessToken: string, 
    accountId: string, 
    fromDate?: Date, 
    toDate?: Date
  ): Promise<BankTransactionInfo[]> {
    const params = new URLSearchParams();
    if (fromDate) params.append('dateFrom', fromDate.toISOString().split('T')[0]);
    if (toDate) params.append('dateTo', toDate.toISOString().split('T')[0]);

    const response = await fetch(
      `${this.apiBaseUrl}/v1/accounts/${accountId}/transactions?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Ошибка получения транзакций Сбербанк: ${response.statusText}`);
    }

    const data = await response.json();
    return data.transactions.booked.map((transaction: any) => ({
      transactionId: transaction.transactionId,
      amount: Math.abs(parseFloat(transaction.transactionAmount.amount)),
      currency: transaction.transactionAmount.currency,
      description: transaction.remittanceInformationUnstructured || 'Операция',
      merchant: transaction.creditorName || transaction.debtorName,
      transactionDate: new Date(transaction.bookingDate),
      type: parseFloat(transaction.transactionAmount.amount) > 0 ? 'credit' : 'debit',
    }));
  }

  async getAccountBalance(accessToken: string, accountId: string): Promise<number> {
    const response = await fetch(`${this.apiBaseUrl}/v1/accounts/${accountId}/balances`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Ошибка получения баланса Сбербанк: ${response.statusText}`);
    }

    const data = await response.json();
    return parseFloat(data.balances?.[0]?.balanceAmount?.amount || '0');
  }

  private mapAccountType(type: string): 'checking' | 'savings' | 'credit' {
    switch (type?.toLowerCase()) {
      case 'cacc': return 'checking';
      case 'svgs': return 'savings';
      case 'card': return 'checking';
      default: return 'checking';
    }
  }
}

/**
 * API Тинькофф Банка
 */
class TinkoffAPI extends BaseBankAPI {
  constructor(credentials: BankApiCredentials) {
    super('tinkoff', 'Тинькофф Банк', 'https://api.tinkoff.ru', credentials);
  }

  generateAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.credentials.clientId,
      redirect_uri: this.credentials.redirectUri,
      scope: this.credentials.scope.join(' '),
      state: state,
    });

    return `${this.apiBaseUrl}/auth/oauth/authorize?${params.toString()}`;
  }

  async exchangeCodeForToken(authCode: string) {
    const response = await fetch(`${this.apiBaseUrl}/auth/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        code: authCode,
        redirect_uri: this.credentials.redirectUri,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка обмена кода Тинькофф: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async refreshAccessToken(refreshToken: string) {
    const response = await fetch(`${this.apiBaseUrl}/auth/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка обновления токена Тинькофф: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  async getAccounts(accessToken: string): Promise<BankAccountInfo[]> {
    const response = await fetch(`${this.apiBaseUrl}/v1/accounts`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Ошибка получения счетов Тинькофф: ${response.statusText}`);
    }

    const data = await response.json();
    return data.payload.accounts.map((account: any) => ({
      accountId: account.id,
      accountType: this.mapAccountType(account.type),
      accountName: account.name,
      balance: account.balance.value / 100, // копейки в рубли
      currency: account.balance.currency.name,
      maskedNumber: account.number,
    }));
  }

  async getTransactions(
    accessToken: string, 
    accountId: string, 
    fromDate?: Date, 
    toDate?: Date
  ): Promise<BankTransactionInfo[]> {
    const params = new URLSearchParams({
      accountId: accountId,
    });
    if (fromDate) params.append('from', fromDate.toISOString());
    if (toDate) params.append('to', toDate.toISOString());

    const response = await fetch(
      `${this.apiBaseUrl}/v1/operations?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Ошибка получения транзакций Тинькофф: ${response.statusText}`);
    }

    const data = await response.json();
    return data.payload.operations.map((operation: any) => ({
      transactionId: operation.id,
      amount: Math.abs(operation.operationAmount.value) / 100,
      currency: operation.operationAmount.currency.name,
      description: operation.description,
      merchant: operation.merchant?.name,
      category: operation.category?.name,
      transactionDate: new Date(operation.operationTime),
      type: operation.operationAmount.value > 0 ? 'credit' : 'debit',
    }));
  }

  async getAccountBalance(accessToken: string, accountId: string): Promise<number> {
    const accounts = await this.getAccounts(accessToken);
    const account = accounts.find(acc => acc.accountId === accountId);
    return account?.balance || 0;
  }

  private mapAccountType(type: string): 'checking' | 'savings' | 'credit' {
    switch (type?.toLowerCase()) {
      case 'current': return 'checking';
      case 'saving': return 'savings';
      case 'credit': return 'credit';
      default: return 'checking';
    }
  }
}

/**
 * Главный сервис для работы с банковскими API
 */
export class BankApiService {
  private bankAPIs: Map<string, BaseBankAPI> = new Map();

  constructor() {
    this.initializeBankAPIs();
  }

  private initializeBankAPIs() {
    // Инициализация API банков (учетные данные должны быть в переменных окружения)
    if (process.env.SBERBANK_CLIENT_ID && process.env.SBERBANK_CLIENT_SECRET) {
      const sberbankAPI = new SberbankAPI({
        clientId: process.env.SBERBANK_CLIENT_ID,
        clientSecret: process.env.SBERBANK_CLIENT_SECRET,
        scope: ['accounts', 'transactions'],
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/banks/callback/sberbank`,
      });
      this.bankAPIs.set('sberbank', sberbankAPI);
    }

    if (process.env.TINKOFF_CLIENT_ID && process.env.TINKOFF_CLIENT_SECRET) {
      const tinkoffAPI = new TinkoffAPI({
        clientId: process.env.TINKOFF_CLIENT_ID,
        clientSecret: process.env.TINKOFF_CLIENT_SECRET,
        scope: ['accounts', 'transactions'],
        redirectUri: `${process.env.BASE_URL || 'http://localhost:5000'}/api/banks/callback/tinkoff`,
      });
      this.bankAPIs.set('tinkoff', tinkoffAPI);
    }
  }

  /**
   * Получение доступных банков для подключения
   */
  getAvailableBanks(): Array<{ code: string; name: string; available: boolean }> {
    return [
      { code: 'sberbank', name: 'Сбербанк', available: this.bankAPIs.has('sberbank') },
      { code: 'tinkoff', name: 'Тинькофф Банк', available: this.bankAPIs.has('tinkoff') },
      { code: 'vtb', name: 'ВТБ', available: false }, // TODO: Добавить поддержку
      { code: 'alfabank', name: 'Альфа-Банк', available: false }, // TODO: Добавить поддержку
    ];
  }

  /**
   * Инициация подключения к банку
   */
  async initiateConnection(bankCode: string, userId: string): Promise<{ redirectUrl: string; consentId: string }> {
    const bankAPI = this.bankAPIs.get(bankCode);
    if (!bankAPI) {
      throw new Error(`Банк ${bankCode} не поддерживается`);
    }

    // Генерируем уникальный идентификатор согласия
    const consentId = `consent_${userId}_${bankCode}_${Date.now()}`;
    
    // Создаем URL для авторизации
    const redirectUrl = bankAPI.generateAuthUrl(consentId);

    return { redirectUrl, consentId };
  }

  /**
   * Обработка callback от банка после авторизации
   */
  async handleOAuthCallback(
    bankCode: string, 
    authCode: string, 
    consentId: string, 
    userId: string
  ): Promise<{ success: boolean; connectionId: string }> {
    const bankAPI = this.bankAPIs.get(bankCode);
    if (!bankAPI) {
      throw new Error(`Банк ${bankCode} не поддерживается`);
    }

    try {
      // Обмениваем код на токены
      const tokens = await bankAPI.exchangeCodeForToken(authCode);

      // Сохраняем подключение в базе данных
      const connection = await storage.createBankConnection({
        userId,
        bankCode,
        bankName: this.getBankName(bankCode),
        accessToken: tokens.accessToken, // TODO: Зашифровать
        refreshToken: tokens.refreshToken, // TODO: Зашифровать
        consentId,
        status: 'active',
        lastSyncAt: new Date(),
      });

      // Синхронизируем счета
      await this.syncAccountsForConnection(connection.id);

      return { success: true, connectionId: connection.id };
    } catch (error: any) {
      console.error(`Ошибка обработки callback ${bankCode}:`, error);
      throw new Error(`Не удалось подключить ${bankCode}: ${error?.message || 'Неизвестная ошибка'}`);
    }
  }

  /**
   * Синхронизация счетов для подключения
   */
  async syncAccountsForConnection(connectionId: string): Promise<void> {
    const connection = await storage.getBankConnection(connectionId);
    if (!connection) {
      throw new Error('Подключение не найдено');
    }

    const bankAPI = this.bankAPIs.get(connection.bankCode);
    if (!bankAPI) {
      throw new Error(`API банка ${connection.bankCode} недоступно`);
    }

    try {
      // Получаем список счетов от банка
      const bankAccounts = await bankAPI.getAccounts(connection.accessToken);

      // Сохраняем счета в базе данных
      for (const bankAccount of bankAccounts) {
        await storage.createOrUpdateAccount({
          userId: connection.userId,
          bankConnectionId: connection.id,
          externalAccountId: bankAccount.accountId,
          accountType: bankAccount.accountType,
          accountName: bankAccount.accountName,
          balance: bankAccount.balance.toString(),
          currency: bankAccount.currency,
          isActive: true,
          lastUpdatedAt: new Date(),
        });
      }

      // Обновляем время последней синхронизации
      await storage.updateBankConnection(connectionId, {
        lastSyncAt: new Date(),
      });

    } catch (error) {
      console.error(`Ошибка синхронизации счетов для ${connection.bankCode}:`, error);
      
      // Проверяем, не истек ли токен
      if (error?.message?.includes('401') || error?.message?.includes('токен')) {
        await this.refreshConnectionToken(connectionId);
        // Повторная попытка после обновления токена
        return this.syncAccountsForConnection(connectionId);
      }
      
      throw error;
    }
  }

  /**
   * Обновление токена доступа для подключения
   */
  private async refreshConnectionToken(connectionId: string): Promise<void> {
    const connection = await storage.getBankConnection(connectionId);
    if (!connection) {
      throw new Error('Подключение не найдено');
    }

    const bankAPI = this.bankAPIs.get(connection.bankCode);
    if (!bankAPI) {
      throw new Error(`API банка ${connection.bankCode} недоступно`);
    }

    try {
      const newTokens = await bankAPI.refreshAccessToken(connection.refreshToken);
      
      await storage.updateBankConnection(connectionId, {
        accessToken: newTokens.accessToken, // TODO: Зашифровать
        refreshToken: newTokens.refreshToken, // TODO: Зашифровать
      });
    } catch (error) {
      console.error(`Ошибка обновления токена для ${connection.bankCode}:`, error);
      
      // Если не удалось обновить токен, помечаем подключение как истекшее
      await storage.updateBankConnection(connectionId, {
        status: 'expired',
      });
      
      throw new Error('Требуется повторная авторизация в банке');
    }
  }

  private getBankName(bankCode: string): string {
    const bankNames: Record<string, string> = {
      'sberbank': 'Сбербанк',
      'tinkoff': 'Тинькофф Банк',
      'vtb': 'ВТБ',
      'alfabank': 'Альфа-Банк',
    };
    return bankNames[bankCode] || bankCode;
  }
}

export const bankApiService = new BankApiService();