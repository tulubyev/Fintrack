import { BaseService, ValidationError, BusinessError, NotFoundError } from "./BaseService";
import type { 
  IFinanceService,
  TransactionData,
  FinancialSummary,
  CategoryAnalysis 
} from "./interfaces";
import type { Transaction, InsertTransaction, Account, Investment } from "@shared/schema";

/**
 * FinanceService - сервис для работы с финансовыми данными
 * Инкапсулирует всю бизнес-логику финансового анализа, транзакций и инвестиций
 */
export class FinanceService extends BaseService implements IFinanceService {

  /**
   * Получение агрегированной финансовой сводки пользователя
   */
  async getUserFinancialSummary(userId: string): Promise<FinancialSummary> {
    this.validateUserId(userId);

    try {
      // Проверяем кэш
      const cacheKey = `financial_summary:${userId}`;
      const cached = await this.getFromCache<FinancialSummary>(cacheKey);
      if (cached) {
        await this.auditLog('getFinancialSummary_cached', userId);
        return cached;
      }

      // Параллельно получаем все финансовые данные
      const [
        totalBalance,
        bankConnections,
        investments,
        recentTransactions
      ] = await Promise.all([
        this.storage.getTotalBalance(userId),
        this.storage.getBankConnections(userId),
        this.storage.getUserInvestments ? this.storage.getUserInvestments(userId) : [],
        this.storage.getUserTransactions(userId, { limit: 10 })
      ]);

      // Подсчитываем аналитику
      const monthlyIncome = await this.calculateMonthlyIncome(userId);
      const monthlyExpenses = await this.calculateMonthlyExpenses(userId);
      const savingsGoalProgress = await this.calculateSavingsProgress(userId);
      const investmentReturn = await this.calculateInvestmentReturn(investments);

      const summary: FinancialSummary = {
        totalBalance: parseFloat(totalBalance),
        monthlyIncome,
        monthlyExpenses,
        savingsGoalProgress,
        investmentReturn,
        connectedBanks: bankConnections.length,
        activeInvestments: investments.length,
        recentTransactionsCount: recentTransactions.length,
        lastUpdated: new Date()
      };

      // Кэшируем на 10 минут
      await this.setCache(cacheKey, summary, 600);

      await this.auditLog('getFinancialSummary', userId);
      return summary;

    } catch (error) {
      return this.handleError(error, 'getUserFinancialSummary', userId);
    }
  }

  /**
   * Создание транзакции с категоризацией
   */
  async createTransaction(userId: string, transactionData: TransactionData): Promise<Transaction> {
    this.validateUserId(userId);

    try {
      // Валидируем транзакцию
      await this.validateTransactionData(transactionData);

      // Автоматически определяем категорию если не указана
      if (!transactionData.category) {
        transactionData.category = await this.categorizeTransaction(transactionData);
      }

      // Проверяем баланс для расходных операций
      if (transactionData.amount < 0) {
        const accountBalance = await this.storage.getAccountBalance(transactionData.accountId);
        if (Math.abs(transactionData.amount) > parseFloat(accountBalance)) {
          throw new BusinessError('Недостаточно средств для проведения операции');
        }
      }

      // Создаем транзакцию
      const transaction = await this.storage.createTransaction({
        userId,
        accountId: transactionData.accountId,
        amount: transactionData.amount.toString(),
        description: transactionData.description,
        category: transactionData.category,
        merchantName: transactionData.merchantName,
        location: transactionData.location,
        isRecurring: transactionData.isRecurring || false,
        tags: transactionData.tags ? JSON.stringify(transactionData.tags) : null
      });

      // Обновляем баланс счета
      await this.updateAccountBalance(transactionData.accountId, transactionData.amount);

      // Инвалидируем кэш
      await this.clearCache(`financial_summary:${userId}`);
      await this.clearCache(`category_analysis:${userId}`);

      await this.auditLog('transaction_created', userId, {
        transactionId: transaction.id,
        amount: transactionData.amount,
        category: transactionData.category
      });

      return transaction;

    } catch (error) {
      return this.handleError(error, 'createTransaction', userId);
    }
  }

  /**
   * Анализ расходов по категориям
   */
  async getCategoryAnalysis(userId: string, period: 'month' | 'quarter' | 'year' = 'month'): Promise<CategoryAnalysis[]> {
    this.validateUserId(userId);

    try {
      // Проверяем кэш
      const cacheKey = `category_analysis:${userId}:${period}`;
      const cached = await this.getFromCache<CategoryAnalysis[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const dateFrom = this.getPeriodStartDate(period);
      const transactions = await this.storage.getUserTransactions(userId, {
        dateFrom,
        dateTo: new Date()
      });

      // Группируем по категориям
      const categoryGroups = this.groupTransactionsByCategory(transactions);
      
      // Вычисляем аналитику для каждой категории
      const analysis: CategoryAnalysis[] = Object.entries(categoryGroups).map(([category, categoryTransactions]) => {
        const totalAmount = categoryTransactions.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
        const transactionCount = categoryTransactions.length;
        const averageAmount = totalAmount / transactionCount;
        
        return {
          category,
          totalAmount,
          transactionCount,
          averageAmount,
          percentage: 0, // Будет вычислено после
          trend: this.calculateCategoryTrend(category, transactions, period)
        };
      });

      // Вычисляем проценты
      const totalSpent = analysis.reduce((sum, a) => sum + a.totalAmount, 0);
      analysis.forEach(a => {
        a.percentage = totalSpent > 0 ? (a.totalAmount / totalSpent) * 100 : 0;
      });

      // Сортируем по сумме
      analysis.sort((a, b) => b.totalAmount - a.totalAmount);

      // Кэшируем на 1 час
      await this.setCache(cacheKey, analysis, 3600);

      await this.auditLog('category_analysis', userId, { period });
      return analysis;

    } catch (error) {
      return this.handleError(error, 'getCategoryAnalysis', userId);
    }
  }

  /**
   * Прогнозирование бюджета на основе истории
   */
  async generateBudgetForecast(userId: string): Promise<any> {
    this.validateUserId(userId);

    try {
      // Получаем историю за последние 6 месяцев
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const transactions = await this.storage.getUserTransactions(userId, {
        dateFrom: sixMonthsAgo,
        dateTo: new Date()
      });

      // Анализируем паттерны расходов
      const monthlyPatterns = this.analyzeMonthlyPatterns(transactions);
      const categoryPatterns = this.analyzeCategoryPatterns(transactions);
      
      // Генерируем прогноз на следующий месяц
      const forecast = {
        expectedIncome: this.predictMonthlyIncome(monthlyPatterns),
        expectedExpenses: this.predictMonthlyExpenses(categoryPatterns),
        categoryBreakdown: this.predictCategoryExpenses(categoryPatterns),
        savingsOpportunities: this.findSavingsOpportunities(categoryPatterns),
        confidenceLevel: this.calculateForecastConfidence(transactions.length)
      };

      await this.auditLog('budget_forecast_generated', userId);
      return forecast;

    } catch (error) {
      return this.handleError(error, 'generateBudgetForecast', userId);
    }
  }

  /**
   * Оптимизация подписок и рекуррентных платежей
   */
  async optimizeSubscriptions(userId: string): Promise<any> {
    this.validateUserId(userId);

    try {
      // Находим рекуррентные транзакции
      const recurringTransactions = await this.storage.getUserTransactions(userId, {
        isRecurring: true
      });

      // Анализируем подписки
      const subscriptions = this.analyzeSubscriptions(recurringTransactions);
      
      // Находим возможности оптимизации
      const optimizations = {
        unusedSubscriptions: this.findUnusedSubscriptions(subscriptions),
        duplicateServices: this.findDuplicateServices(subscriptions),
        potentialSavings: this.calculatePotentialSavings(subscriptions),
        recommendations: this.generateOptimizationRecommendations(subscriptions)
      };

      await this.auditLog('subscriptions_optimized', userId);
      return optimizations;

    } catch (error) {
      return this.handleError(error, 'optimizeSubscriptions', userId);
    }
  }

  // ===========================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ===========================================

  /**
   * Валидация данных транзакции
   */
  private async validateTransactionData(data: TransactionData): Promise<void> {
    if (!data.accountId) {
      throw new ValidationError('ID счета обязателен');
    }

    if (data.amount === 0) {
      throw new ValidationError('Сумма транзакции не может быть нулевой');
    }

    if (!data.description || data.description.trim().length === 0) {
      throw new ValidationError('Описание транзакции обязательно');
    }

    // Проверяем существование счета
    const account = await this.storage.getAccount(data.accountId);
    if (!account) {
      throw new NotFoundError('Счет', data.accountId);
    }
  }

  /**
   * Автоматическая категоризация транзакции
   */
  private async categorizeTransaction(data: TransactionData): Promise<string> {
    const description = data.description.toLowerCase();
    const merchant = data.merchantName?.toLowerCase() || '';

    // Простые правила категоризации (в реальности - ML модель)
    if (description.includes('продукты') || merchant.includes('магнит') || merchant.includes('пятерочка')) {
      return 'groceries';
    }
    if (description.includes('топливо') || merchant.includes('лукойл') || merchant.includes('роснефть')) {
      return 'fuel';
    }
    if (description.includes('кафе') || description.includes('ресторан')) {
      return 'restaurants';
    }
    if (description.includes('аптека') || description.includes('медицина')) {
      return 'healthcare';
    }
    if (description.includes('транспорт') || description.includes('такси')) {
      return 'transport';
    }

    return 'other';
  }

  /**
   * Обновление баланса счета
   */
  private async updateAccountBalance(accountId: string, amount: number): Promise<void> {
    const currentBalance = await this.storage.getAccountBalance(accountId);
    const newBalance = parseFloat(currentBalance) + amount;
    await this.storage.updateAccountBalance(accountId, newBalance.toString());
  }

  /**
   * Расчет месячного дохода
   */
  private async calculateMonthlyIncome(userId: string): Promise<number> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const transactions = await this.storage.getUserTransactions(userId, {
      dateFrom: monthStart,
      dateTo: new Date()
    });

    return transactions
      .filter(t => parseFloat(t.amount) > 0)
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  }

  /**
   * Расчет месячных расходов
   */
  private async calculateMonthlyExpenses(userId: string): Promise<number> {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const transactions = await this.storage.getUserTransactions(userId, {
      dateFrom: monthStart,
      dateTo: new Date()
    });

    return Math.abs(transactions
      .filter(t => parseFloat(t.amount) < 0)
      .reduce((sum, t) => sum + parseFloat(t.amount), 0));
  }

  /**
   * Расчет прогресса накоплений
   */
  private async calculateSavingsProgress(userId: string): Promise<number> {
    // Заглушка для расчета прогресса накоплений
    // В реальности здесь будет сложная логика с целями накоплений
    return Math.random() * 100;
  }

  /**
   * Расчет доходности инвестиций
   */
  private async calculateInvestmentReturn(investments: Investment[]): Promise<number> {
    if (investments.length === 0) return 0;

    // Простой расчет доходности
    return investments.reduce((sum, inv) => {
      const currentValue = parseFloat(inv.currentValue || "0");
      const purchaseValue = parseFloat(inv.purchaseValue || "0");
      return sum + ((currentValue - purchaseValue) / purchaseValue) * 100;
    }, 0) / investments.length;
  }

  /**
   * Получение начальной даты для периода
   */
  private getPeriodStartDate(period: 'month' | 'quarter' | 'year'): Date {
    const date = new Date();
    
    switch (period) {
      case 'month':
        date.setDate(1);
        break;
      case 'quarter':
        const quarter = Math.floor(date.getMonth() / 3);
        date.setMonth(quarter * 3);
        date.setDate(1);
        break;
      case 'year':
        date.setMonth(0);
        date.setDate(1);
        break;
    }
    
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * Группировка транзакций по категориям
   */
  private groupTransactionsByCategory(transactions: Transaction[]): Record<string, Transaction[]> {
    return transactions.reduce((groups, transaction) => {
      const category = transaction.category || 'other';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(transaction);
      return groups;
    }, {} as Record<string, Transaction[]>);
  }

  /**
   * Расчет тренда категории
   */
  private calculateCategoryTrend(category: string, transactions: Transaction[], period: string): 'up' | 'down' | 'stable' {
    // Простая логика тренда - в реальности более сложная
    const categoryTransactions = transactions.filter(t => t.category === category);
    
    if (categoryTransactions.length < 2) return 'stable';
    
    const recentAmount = categoryTransactions.slice(-Math.ceil(categoryTransactions.length / 2))
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
    const earlierAmount = categoryTransactions.slice(0, Math.floor(categoryTransactions.length / 2))
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0);
    
    const change = (recentAmount - earlierAmount) / earlierAmount;
    
    if (change > 0.1) return 'up';
    if (change < -0.1) return 'down';
    return 'stable';
  }

  /**
   * Анализ месячных паттернов
   */
  private analyzeMonthlyPatterns(transactions: Transaction[]): any {
    // Заглушка для анализа паттернов
    return { avgIncome: 0, avgExpenses: 0 };
  }

  /**
   * Анализ паттернов категорий
   */
  private analyzeCategoryPatterns(transactions: Transaction[]): any {
    // Заглушка для анализа категорий
    return {};
  }

  /**
   * Прогноз месячного дохода
   */
  private predictMonthlyIncome(patterns: any): number {
    return patterns.avgIncome || 0;
  }

  /**
   * Прогноз месячных расходов
   */
  private predictMonthlyExpenses(patterns: any): number {
    return patterns.avgExpenses || 0;
  }

  /**
   * Прогноз расходов по категориям
   */
  private predictCategoryExpenses(patterns: any): any {
    return {};
  }

  /**
   * Поиск возможностей экономии
   */
  private findSavingsOpportunities(patterns: any): string[] {
    return [];
  }

  /**
   * Расчет уверенности прогноза
   */
  private calculateForecastConfidence(transactionCount: number): number {
    return Math.min(transactionCount / 100, 1) * 100;
  }

  /**
   * Анализ подписок
   */
  private analyzeSubscriptions(transactions: Transaction[]): any {
    return {};
  }

  /**
   * Поиск неиспользуемых подписок
   */
  private findUnusedSubscriptions(subscriptions: any): any[] {
    return [];
  }

  /**
   * Поиск дублирующихся сервисов
   */
  private findDuplicateServices(subscriptions: any): any[] {
    return [];
  }

  /**
   * Расчет потенциальной экономии
   */
  private calculatePotentialSavings(subscriptions: any): number {
    return 0;
  }

  /**
   * Генерация рекомендаций по оптимизации
   */
  private generateOptimizationRecommendations(subscriptions: any): string[] {
    return [];
  }
}

// Экспортируем singleton instance
export const financeService = new FinanceService();