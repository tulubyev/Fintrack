import { Request, Response, NextFunction } from 'express';
import { 
  AsyncMiddleware, 
  ErrorCodes,
  HttpStatus 
} from './types';
import { AppError, asyncHandler } from './errorHandler';

// ===========================================
// TRANSACTION MIDDLEWARE СИСТЕМА
// ===========================================

/**
 * Конфигурация транзакции
 */
export interface TransactionConfig {
  isolationLevel?: 'read_uncommitted' | 'read_committed' | 'repeatable_read' | 'serializable';
  readOnly?: boolean; // режим только для чтения
  autoCommit?: boolean; // автоматический commit при успехе
  rollbackOnError?: boolean; // автоматический rollback при ошибке
  timeout?: number; // таймаут транзакции в миллисекундах
  retryOnConflict?: boolean; // повтор при конфликте
  maxRetries?: number; // максимальное количество повторов
  onStart?: (transactionId: string) => void; // callback при старте
  onCommit?: (transactionId: string, duration: number) => void; // callback при commit
  onRollback?: (transactionId: string, reason: string, duration: number) => void; // callback при rollback
}

/**
 * Метрики транзакций
 */
export interface TransactionMetrics {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  averageDuration: number;
  deadlockCount: number;
  timeoutCount: number;
  retryCount: number;
  successRate: number;
}

/**
 * Информация о транзакции
 */
interface TransactionInfo {
  id: string;
  startTime: number;
  config: TransactionConfig;
  retryCount: number;
  lastError?: Error;
}

/**
 * Менеджер транзакций
 */
class TransactionManager {
  private activeTransactions = new Map<string, TransactionInfo>();
  private metrics: TransactionMetrics = {
    totalTransactions: 0,
    successfulTransactions: 0,
    failedTransactions: 0,
    averageDuration: 0,
    deadlockCount: 0,
    timeoutCount: 0,
    retryCount: 0,
    successRate: 0
  };

  /**
   * Создание уникального ID транзакции
   */
  private generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Начало транзакции
   */
  async startTransaction(config: TransactionConfig = {}): Promise<string> {
    const transactionId = this.generateTransactionId();
    const startTime = Date.now();

    const transactionInfo: TransactionInfo = {
      id: transactionId,
      startTime,
      config: {
        isolationLevel: 'read_committed',
        autoCommit: true,
        rollbackOnError: true,
        timeout: 30000, // 30 секунд по умолчанию
        retryOnConflict: true,
        maxRetries: 3,
        ...config
      },
      retryCount: 0
    };

    this.activeTransactions.set(transactionId, transactionInfo);
    this.metrics.totalTransactions++;

    // Callback при старте
    if (config.onStart) {
      config.onStart(transactionId);
    }

    console.log(`🔄 Transaction started: ${transactionId}`);
    return transactionId;
  }

  /**
   * Завершение транзакции с commit
   */
  async commitTransaction(transactionId: string): Promise<void> {
    const transactionInfo = this.activeTransactions.get(transactionId);
    
    if (!transactionInfo) {
      throw new AppError(
        `Транзакция ${transactionId} не найдена`,
        ErrorCodes.RESOURCE_NOT_FOUND,
        HttpStatus.NOT_FOUND
      );
    }

    try {
      const duration = Date.now() - transactionInfo.startTime;
      
      // Здесь будет реальный commit к базе данных
      // await db.commit(transactionId);
      
      this.metrics.successfulTransactions++;
      this.updateSuccessRate();
      this.updateAverageDuration(duration);

      // Callback при commit
      if (transactionInfo.config.onCommit) {
        transactionInfo.config.onCommit(transactionId, duration);
      }

      console.log(`✅ Transaction committed: ${transactionId} (${duration}ms)`);
    } catch (error) {
      console.error(`❌ Commit failed for transaction ${transactionId}:`, error);
      await this.rollbackTransaction(transactionId, 'commit_failed');
      throw error;
    } finally {
      this.activeTransactions.delete(transactionId);
    }
  }

  /**
   * Откат транзакции
   */
  async rollbackTransaction(transactionId: string, reason: string = 'manual'): Promise<void> {
    const transactionInfo = this.activeTransactions.get(transactionId);
    
    if (!transactionInfo) {
      console.warn(`⚠️ Transaction ${transactionId} not found for rollback`);
      return;
    }

    try {
      const duration = Date.now() - transactionInfo.startTime;
      
      // Здесь будет реальный rollback к базе данных
      // await db.rollback(transactionId);
      
      this.metrics.failedTransactions++;
      this.updateSuccessRate();

      // Обновляем специфичные метрики
      if (reason === 'deadlock') {
        this.metrics.deadlockCount++;
      } else if (reason === 'timeout') {
        this.metrics.timeoutCount++;
      }

      // Callback при rollback
      if (transactionInfo.config.onRollback) {
        transactionInfo.config.onRollback(transactionId, reason, duration);
      }

      console.log(`🔄 Transaction rolled back: ${transactionId} (reason: ${reason}, ${duration}ms)`);
    } catch (error) {
      console.error(`❌ Rollback failed for transaction ${transactionId}:`, error);
    } finally {
      this.activeTransactions.delete(transactionId);
    }
  }

  /**
   * Проверка таймаута транзакций
   */
  checkTimeouts(): void {
    const now = Date.now();
    const timedOutTransactions: string[] = [];

    this.activeTransactions.forEach((info, transactionId) => {
      const duration = now - info.startTime;
      
      if (info.config.timeout && duration > info.config.timeout) {
        timedOutTransactions.push(transactionId);
      }
    });

    // Откатываем транзакции с таймаутом
    for (const transactionId of timedOutTransactions) {
      this.rollbackTransaction(transactionId, 'timeout');
    }
  }

  /**
   * Получение метрик
   */
  getMetrics(): TransactionMetrics {
    return { ...this.metrics };
  }

  /**
   * Получение активных транзакций
   */
  getActiveTransactions(): Array<{id: string, duration: number, config: TransactionConfig}> {
    const now = Date.now();
    
    const result: Array<{id: string, duration: number, config: TransactionConfig}> = [];
    this.activeTransactions.forEach((info, id) => {
      result.push({
        id,
        duration: now - info.startTime,
        config: info.config
      });
    });
    return result;
  }

  /**
   * Очистка всех активных транзакций (для аварийных ситуаций)
   */
  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up all active transactions...');
    
    const activeIds = Array.from(this.activeTransactions.keys());
    
    for (const transactionId of activeIds) {
      await this.rollbackTransaction(transactionId, 'cleanup');
    }
    
    console.log(`✅ Cleaned up ${activeIds.length} transactions`);
  }

  // ===========================================
  // PRIVATE МЕТОДЫ
  // ===========================================

  private updateSuccessRate(): void {
    const total = this.metrics.successfulTransactions + this.metrics.failedTransactions;
    this.metrics.successRate = total > 0 
      ? (this.metrics.successfulTransactions / total) * 100 
      : 0;
  }

  private updateAverageDuration(duration: number): void {
    const currentAvg = this.metrics.averageDuration;
    const successCount = this.metrics.successfulTransactions;
    
    this.metrics.averageDuration = ((currentAvg * (successCount - 1)) + duration) / successCount;
  }
}

// Глобальный менеджер транзакций
const transactionManager = new TransactionManager();

// Запускаем периодическую проверку таймаутов
setInterval(() => {
  transactionManager.checkTimeouts();
}, 10000); // каждые 10 секунд

// ===========================================
// MIDDLEWARE ФУНКЦИИ
// ===========================================

/**
 * Основной transaction middleware
 */
export const withTransaction = (config: TransactionConfig = {}): AsyncMiddleware => {
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    // Пропускаем GET запросы если не указано иное
    if (req.method === 'GET' && !config.readOnly) {
      return next();
    }

    let transactionId: string | null = null;
    let shouldRetry = true;
    let retryCount = 0;
    const maxRetries = config.maxRetries || 3;

    while (shouldRetry && retryCount <= maxRetries) {
      try {
        // Начинаем транзакцию
        transactionId = await transactionManager.startTransaction(config);
        
        // Добавляем transaction ID в request для использования в handlers
        (req as any).transactionId = transactionId;

        // Перехватываем response для автоматического commit/rollback
        let hasFinished = false;
        const originalSend = res.send;
        const originalJson = res.json;

        const finishTransaction = async (success: boolean) => {
          if (hasFinished || !transactionId) return;
          hasFinished = true;

          try {
            if (success && config.autoCommit !== false) {
              await transactionManager.commitTransaction(transactionId);
            } else if (!success && config.rollbackOnError !== false) {
              await transactionManager.rollbackTransaction(transactionId, 'error_response');
            }
          } catch (error) {
            console.error('Transaction finish error:', error);
          }
        };

        // Перехватываем response методы
        res.send = function(data: any) {
          const isSuccess = res.statusCode >= 200 && res.statusCode < 400;
          finishTransaction(isSuccess);
          return originalSend.call(this, data);
        };

        res.json = function(data: any) {
          const isSuccess = res.statusCode >= 200 && res.statusCode < 400;
          finishTransaction(isSuccess);
          return originalJson.call(this, data);
        };

        // Выполняем следующий middleware
        await new Promise<void>((resolve, reject) => {
          try {
            next((error?: any) => {
              if (error) {
                finishTransaction(false);
                reject(error);
              } else {
                resolve();
              }
            });
          } catch (error) {
            finishTransaction(false);
            reject(error);
          }
        });

        shouldRetry = false; // Успешно выполнено, не повторяем

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorCode = (error as any)?.code;
        retryCount++;
        
        // Проверяем, нужно ли повторить при конфликте
        const isDeadlock = errorCode === '40001' || errorMessage?.includes('deadlock');
        const shouldRetryOnConflict = config.retryOnConflict && isDeadlock;

        if (transactionId) {
          await transactionManager.rollbackTransaction(
            transactionId, 
            isDeadlock ? 'deadlock' : 'error'
          );
        }

        if (shouldRetryOnConflict && retryCount <= maxRetries) {
          console.log(`🔄 Retrying transaction (attempt ${retryCount}/${maxRetries}) due to conflict`);
          const currentMetrics = transactionManager.getMetrics();
          currentMetrics.retryCount++;
          
          // Экспоненциальная задержка перед повтором
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
          continue;
        }

        shouldRetry = false;
        throw error;
      }
    }
  });
};

// ===========================================
// СПЕЦИАЛИЗИРОВАННЫЕ TRANSACTION MIDDLEWARE
// ===========================================

/**
 * Строгая транзакция для критичных операций
 */
export const strictTransaction = withTransaction({
  isolationLevel: 'serializable',
  rollbackOnError: true,
  timeout: 15000,
  retryOnConflict: true,
  maxRetries: 5
});

/**
 * Быстрая транзакция для простых операций
 */
export const quickTransaction = withTransaction({
  isolationLevel: 'read_committed',
  timeout: 5000,
  retryOnConflict: false,
  maxRetries: 1
});

/**
 * Транзакция только для чтения
 */
export const readOnlyTransaction = withTransaction({
  readOnly: true,
  isolationLevel: 'read_committed',
  timeout: 10000,
  autoCommit: false
});

/**
 * Финансовая транзакция с максимальной надежностью
 */
export const financialTransaction = withTransaction({
  isolationLevel: 'serializable',
  rollbackOnError: true,
  timeout: 30000,
  retryOnConflict: true,
  maxRetries: 10,
  onStart: (id) => console.log(`💰 Financial transaction started: ${id}`),
  onCommit: (id, duration) => console.log(`💰 Financial transaction committed: ${id} (${duration}ms)`),
  onRollback: (id, reason, duration) => console.warn(`💰 Financial transaction failed: ${id} (${reason}, ${duration}ms)`)
});

// ===========================================
// UTILITY ФУНКЦИИ
// ===========================================

/**
 * Получение метрик транзакций
 */
export const getTransactionMetrics = (): TransactionMetrics => {
  return transactionManager.getMetrics();
};

/**
 * Получение активных транзакций
 */
export const getActiveTransactions = () => {
  return transactionManager.getActiveTransactions();
};

/**
 * Принудительная очистка всех транзакций
 */
export const cleanupTransactions = async (): Promise<void> => {
  await transactionManager.cleanup();
};

/**
 * Middleware для мониторинга транзакций
 */
export const transactionMonitor = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // Добавляем headers для мониторинга
    res.setHeader('X-Transaction-Start', startTime.toString());
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const transactionId = (req as any).transactionId;
      
      if (transactionId) {
        res.setHeader('X-Transaction-ID', transactionId);
        res.setHeader('X-Transaction-Duration', duration.toString());
        
        // Логируем медленные транзакции
        if (duration > 5000) {
          console.warn(`🐌 Slow transaction: ${transactionId} (${duration}ms)`);
        }
      }
    });

    next();
  }
);

// ===========================================
// BATCH OPERATIONS
// ===========================================

/**
 * Middleware для batch операций с оптимизацией
 */
export const batchTransaction = (config: TransactionConfig & {
  batchSize?: number;
  processingDelay?: number;
}) => {
  const { batchSize = 100, processingDelay = 0, ...transactionConfig } = config;
  
  return asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const batchData = req.body?.batch;
    
    if (!Array.isArray(batchData)) {
      return next();
    }

    // Разбиваем на batch'и
    const batches = [];
    for (let i = 0; i < batchData.length; i += batchSize) {
      batches.push(batchData.slice(i, i + batchSize));
    }

    let results: any[] = [];
    let errors: any[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      try {
        // Каждый batch в отдельной транзакции
        const transactionId = await transactionManager.startTransaction(transactionConfig);
        
        // Обрабатываем batch
        const batchResults = await processBatch(batch, transactionId);
        results = results.concat(batchResults);
        
        await transactionManager.commitTransaction(transactionId);
        
        // Задержка между batch'ами если настроена
        if (processingDelay > 0 && i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, processingDelay));
        }
        
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({
          batchIndex: i,
          error: errorMessage,
          items: batch.length
        });
      }
    }

    // Возвращаем результаты
    res.json({
      success: errors.length === 0,
      processed: results.length,
      errors: errors,
      results: results
    });
  });
};

/**
 * Вспомогательная функция для обработки batch
 */
async function processBatch(batch: any[], transactionId: string): Promise<any[]> {
  // Здесь будет логика обработки batch'а
  // В реальном проекте это будет работать с базой данных
  
  return batch.map((item, index) => ({
    id: `${transactionId}_${index}`,
    processed: true,
    data: item
  }));
}