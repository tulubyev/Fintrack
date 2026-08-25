import { BaseService, ValidationError, BusinessError, NotFoundError } from "./BaseService";
import type { 
  IBankService, 
  BankCredentials, 
  BankConnectionInfo, 
  SyncResult 
} from "./interfaces";
import type { BankConnection, InsertBankConnection, Account } from "@shared/schema";

/**
 * BankService - сервис для интеграции с банками и ПКС
 * Инкапсулирует всю бизнес-логику работы с банковскими подключениями
 */
export class BankService extends BaseService implements IBankService {

  /**
   * Подключение банка к пользователю
   */
  async connectBank(userId: string, bankCode: string, credentials: BankCredentials): Promise<BankConnection> {
    this.validateUserId(userId);
    
    if (!bankCode || !credentials) {
      throw new ValidationError('Код банка и учетные данные обязательны');
    }

    try {
      // Проверяем лимиты подключений
      const existingConnections = await this.storage.getBankConnections(userId);
      if (existingConnections.length >= 10) {
        throw new BusinessError('Превышен лимит подключенных банков (максимум 10)');
      }

      // Проверяем, не подключен ли уже этот банк
      const existingConnection = existingConnections.find(conn => 
        conn.bankCode === bankCode && conn.status === 'active'
      );
      if (existingConnection) {
        throw new BusinessError(`Банк ${bankCode} уже подключен`);
      }

      // Валидируем банк
      this.validateBankCode(bankCode);

      // Создаем подключение (симуляция, в реальности - интеграция с ПКС API)
      const connectionData: InsertBankConnection = {
        userId,
        bankCode,
        accountNumber: credentials.clientId || `${bankCode}_${Date.now()}`,
        bankName: this.getBankName(bankCode),
        status: 'pending', // Сначала pending, потом active после успешной авторизации
        balance: "0.00",
        currency: "RUB",
        lastSyncAt: null,
        accessToken: credentials.accessToken || null,
        refreshToken: credentials.clientSecret || null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 часа
      };

      const connection = await this.storage.createBankConnection(connectionData);

      // Симуляция авторизации через ПКС
      await this.simulateBankAuth(connection.id, credentials);

      // Активируем подключение после успешной авторизации
      const activeConnection = await this.storage.updateBankConnection(connection.id, {
        status: 'active'
      });

      // Запускаем первоначальную синхронизацию счетов
      await this.syncBankAccounts(connection.id);

      await this.auditLog('bank_connected', userId, { 
        bankCode, 
        connectionId: connection.id 
      });

      return activeConnection || connection;

    } catch (error) {
      return this.handleError(error, 'connectBank', userId);
    }
  }

  /**
   * Отключение банка
   */
  async disconnectBank(userId: string, connectionId: string): Promise<void> {
    this.validateUserId(userId);
    this.validateUUID(connectionId, 'ID подключения');

    try {
      const connection = await this.storage.getBankConnection(connectionId);
      if (!connection) {
        throw new NotFoundError('Подключение к банку', connectionId);
      }

      if (connection.userId !== userId) {
        throw new BusinessError('Недостаточно прав для отключения банка');
      }

      // Деактивируем подключение
      await this.storage.updateBankConnection(connectionId, {
        status: 'inactive',
        lastSyncAt: new Date()
      });

      // Инвалидируем кэш
      await this.clearCache(`bank_connections:${userId}`);
      await this.clearCache(`bank_accounts:${connectionId}`);

      await this.auditLog('bank_disconnected', userId, { 
        connectionId,
        bankCode: connection.bankCode 
      });

    } catch (error) {
      return this.handleError(error, 'disconnectBank', userId);
    }
  }

  /**
   * Синхронизация данных конкретного банка
   */
  async syncBankData(connectionId: string): Promise<SyncResult> {
    this.validateUUID(connectionId, 'ID подключения');

    try {
      const connection = await this.storage.getBankConnection(connectionId);
      if (!connection) {
        throw new NotFoundError('Подключение к банку', connectionId);
      }

      if (connection.status !== 'active') {
        throw new BusinessError('Подключение к банку неактивно');
      }

      // Синхронизируем счета
      const accountsResult = await this.syncBankAccounts(connectionId);
      
      // Синхронизируем транзакции
      const transactionsResult = await this.syncBankTransactions(connectionId);

      // Обновляем время последней синхронизации
      await this.storage.updateBankConnection(connectionId, {
        lastSyncAt: new Date()
      });

      const result: SyncResult = {
        success: true,
        accountsSynced: accountsResult.synced,
        transactionsSynced: transactionsResult.synced,
        errors: [...accountsResult.errors, ...transactionsResult.errors],
        lastSyncAt: new Date()
      };

      await this.auditLog('bank_sync_completed', connection.userId, {
        connectionId,
        result
      });

      return result;

    } catch (error) {
      return this.handleError(error, 'syncBankData');
    }
  }

  /**
   * Синхронизация всех банков пользователя
   */
  async syncAllUserBanks(userId: string): Promise<SyncResult[]> {
    this.validateUserId(userId);

    try {
      const connections = await this.storage.getBankConnections(userId);
      const activeConnections = connections.filter(conn => conn.status === 'active');
      
      if (activeConnections.length === 0) {
        return [];
      }

      const results: SyncResult[] = [];

      // Синхронизируем банки параллельно для скорости
      const syncPromises = activeConnections.map(async (connection) => {
        try {
          const result = await this.syncBankData(connection.id);
          return result;
        } catch (error) {
          console.error(`Sync failed for bank ${connection.bankCode}:`, error);
          return {
            success: false,
            accountsSynced: 0,
            transactionsSynced: 0,
            errors: [error instanceof Error ? error.message : String(error)],
            lastSyncAt: new Date()
          };
        }
      });

      const syncResults = await Promise.all(syncPromises);
      results.push(...syncResults);

      await this.auditLog('sync_all_banks', userId, {
        banksCount: activeConnections.length,
        successCount: results.filter(r => r.success).length
      });

      return results;

    } catch (error) {
      return this.handleError(error, 'syncAllUserBanks', userId);
    }
  }

  /**
   * Получение информации о подключениях банков пользователя
   */
  async getUserBankConnections(userId: string): Promise<BankConnectionInfo[]> {
    this.validateUserId(userId);

    try {
      // Проверяем кэш
      const cacheKey = `bank_connections:${userId}`;
      const cached = await this.getFromCache<BankConnectionInfo[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const connections = await this.storage.getBankConnections(userId);
      
      // Обогащаем данные дополнительной информацией
      const enrichedConnections: BankConnectionInfo[] = await Promise.all(
        connections.map(async (connection) => {
          const accounts = await this.storage.getAccountsByBank(connection.id);
          
          // Вычисляем общий баланс по всем счетам
          const totalBalance = accounts.reduce((sum, account) => {
            return sum + parseFloat(account.balance || "0");
          }, 0);

          return {
            ...connection,
            accountsCount: accounts.length,
            lastSyncAt: connection.lastSyncAt,
            syncStatus: this.getSyncStatus(connection),
            totalBalance: totalBalance.toFixed(2)
          };
        })
      );

      // Кэшируем на 2 минуты
      await this.setCache(cacheKey, enrichedConnections, 120);

      return enrichedConnections;

    } catch (error) {
      return this.handleError(error, 'getUserBankConnections', userId);
    }
  }

  /**
   * Обновление подключения к банку (refresh токенов)
   */
  async refreshBankConnection(connectionId: string): Promise<BankConnection> {
    this.validateUUID(connectionId, 'ID подключения');

    try {
      const connection = await this.storage.getBankConnection(connectionId);
      if (!connection) {
        throw new NotFoundError('Подключение к банку', connectionId);
      }

      // Симуляция обновления токенов (в реальности - вызов API банка)
      const updatedConnection = await this.storage.updateBankConnection(connectionId, {
        accessToken: `refreshed_token_${Date.now()}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Новые 24 часа
        lastSyncAt: new Date()
      });

      // Инвалидируем кэш
      await this.clearCache(`bank_connections:${connection.userId}`);

      await this.auditLog('bank_connection_refreshed', connection.userId, {
        connectionId,
        bankCode: connection.bankCode
      });

      return updatedConnection || connection;

    } catch (error) {
      return this.handleError(error, 'refreshBankConnection');
    }
  }

  // ===========================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ===========================================

  /**
   * Валидация кода банка
   */
  private validateBankCode(bankCode: string): void {
    const validBanks = [
      'sberbank', 'vtb', 'gazprombank', 'alfabank', 'tinkoff',
      'raiffeisen', 'rosbank', 'otkritie', 'uralsib', 'binbank'
    ];
    
    if (!validBanks.includes(bankCode.toLowerCase())) {
      throw new ValidationError(`Неподдерживаемый банк: ${bankCode}`);
    }
  }

  /**
   * Получение названия банка по коду
   */
  private getBankName(bankCode: string): string {
    const bankNames: Record<string, string> = {
      'sberbank': 'ПАО Сбербанк',
      'vtb': 'Банк ВТБ (ПАО)',
      'gazprombank': 'АО «Газпромбанк»',
      'alfabank': 'АО «Альфа-Банк»',
      'tinkoff': 'АО «Тинькофф Банк»',
      'raiffeisen': 'АО «Райффайзенбанк»',
      'rosbank': 'ПАО РОСБАНК',
      'otkritie': 'Банк «ФК Открытие» (ПАО)',
      'uralsib': 'Банк УРАЛСИБ (ПАО)',
      'binbank': 'ПАО «БИНБАНК»'
    };
    
    return bankNames[bankCode.toLowerCase()] || bankCode;
  }

  /**
   * Симуляция авторизации через ПКС
   */
  private async simulateBankAuth(connectionId: string, credentials: BankCredentials): Promise<void> {
    // Симуляция задержки авторизации
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // В реальности здесь будет:
    // 1. OAuth2 flow с банком
    // 2. Получение access/refresh токенов
    // 3. Валидация прав доступа
    // 4. Сохранение зашифрованных токенов
    
    console.log(`Авторизация в банке для подключения ${connectionId} выполнена`);
  }

  /**
   * Синхронизация счетов банка
   */
  private async syncBankAccounts(connectionId: string): Promise<{ synced: number; errors: string[] }> {
    try {
      // Симуляция получения счетов из API банка
      const mockAccounts = [
        {
          userId: '', // будет заполнено из connection
          bankConnectionId: connectionId,
          accountNumber: `4276380000000001`,
          accountName: 'Основной счет',
          accountType: 'checking' as const,
          balance: (Math.random() * 100000).toFixed(2),
          currency: 'RUB',
          isActive: true
        },
        {
          userId: '', // будет заполнено из connection  
          bankConnectionId: connectionId,
          accountNumber: `4276380000000002`,
          accountName: 'Накопительный счет',
          accountType: 'savings' as const,
          balance: (Math.random() * 50000).toFixed(2),
          currency: 'RUB',
          isActive: true
        }
      ];

      // Получаем userId из подключения
      const connection = await this.storage.getBankConnection(connectionId);
      if (!connection) {
        throw new Error('Подключение не найдено');
      }

      let synced = 0;
      const errors: string[] = [];

      for (const accountData of mockAccounts) {
        try {
          accountData.userId = connection.userId;
          await this.storage.createOrUpdateAccount(accountData);
          synced++;
        } catch (error) {
          errors.push(`Ошибка синхронизации счета ${accountData.accountNumber}: ${error}`);
        }
      }

      return { synced, errors };

    } catch (error) {
      return { 
        synced: 0, 
        errors: [error instanceof Error ? error.message : String(error)] 
      };
    }
  }

  /**
   * Синхронизация транзакций банка
   */
  private async syncBankTransactions(connectionId: string): Promise<{ synced: number; errors: string[] }> {
    try {
      // В реальности здесь будет вызов API банка для получения транзакций
      // Пока возвращаем заглушку
      
      const synced = Math.floor(Math.random() * 10); // 0-9 транзакций
      
      return { synced, errors: [] };

    } catch (error) {
      return { 
        synced: 0, 
        errors: [error instanceof Error ? error.message : String(error)] 
      };
    }
  }

  /**
   * Определение статуса синхронизации
   */
  private getSyncStatus(connection: BankConnection): 'success' | 'error' | 'in_progress' {
    if (!connection.lastSyncAt) {
      return 'in_progress';
    }
    
    // Если последняя синхронизация была более часа назад - считаем ошибкой
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (connection.lastSyncAt < hourAgo) {
      return 'error';
    }
    
    return 'success';
  }
}

// Экспортируем singleton instance
export const bankService = new BankService();