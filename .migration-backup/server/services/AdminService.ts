import { BaseService, ValidationError, BusinessError, NotFoundError } from "./BaseService";
import type { 
  IAdminService,
  AdminDashboardData,
  UserModerationData,
  SystemHealthData 
} from "./interfaces";
import type { User, AdminLog, AdminRole } from "@shared/schema";

/**
 * AdminService - сервис для административных функций
 * Инкапсулирует всю бизнес-логику администрирования системы
 */
export class AdminService extends BaseService implements IAdminService {

  /**
   * Получение агрегированных данных для админ-панели
   */
  async getAdminDashboardData(adminUserId: string): Promise<AdminDashboardData> {
    this.validateUserId(adminUserId);

    try {
      // Проверяем права администратора
      const admin = await this.storage.getUser(adminUserId);
      if (!admin || !admin.adminRole) {
        throw new BusinessError('Недостаточно прав для доступа к админ-панели');
      }

      // Проверяем кэш
      const cacheKey = `admin_dashboard:${adminUserId}`;
      const cached = await this.getFromCache<AdminDashboardData>(cacheKey);
      if (cached) {
        await this.auditLog('getAdminDashboard_cached', adminUserId);
        return cached;
      }

      // Параллельно получаем все административные данные
      const [
        totalUsers,
        newUsersToday,
        pendingDocuments,
        systemHealth,
        recentAdminLogs
      ] = await Promise.all([
        this.storage.getTotalUsersCount(),
        this.storage.getNewUsersCount(this.getTodayDate()),
        this.storage.getPendingDocumentsCount(),
        this.getSystemHealthData(),
        this.storage.getAdminLogs(adminUserId, { limit: 10 })
      ]);

      // Получаем статистику по ролям
      const usersByRole = await this.getUsersByRoleStats();
      
      // Получаем финансовую статистику
      const financialStats = await this.getFinancialStats();

      const dashboardData: AdminDashboardData = {
        totalUsers,
        newUsersToday,
        pendingDocuments,
        systemHealth,
        usersByRole,
        financialStats,
        recentLogs: recentAdminLogs,
        lastUpdated: new Date()
      };

      // Кэшируем на 5 минут
      await this.setCache(cacheKey, dashboardData, 300);

      await this.auditLog('getAdminDashboard', adminUserId);
      return dashboardData;

    } catch (error) {
      return this.handleError(error, 'getAdminDashboardData', adminUserId);
    }
  }

  /**
   * Модерация пользователей
   */
  async moderateUser(adminUserId: string, targetUserId: string, action: string, reason?: string): Promise<UserModerationData> {
    this.validateUserId(adminUserId);
    this.validateUserId(targetUserId);

    try {
      // Проверяем права администратора
      const admin = await this.storage.getUser(adminUserId);
      if (!admin || !this.hasPermission(admin.adminRole, action)) {
        throw new BusinessError('Недостаточно прав для выполнения данного действия');
      }

      // Получаем данные пользователя
      const targetUser = await this.storage.getUser(targetUserId);
      if (!targetUser) {
        throw new NotFoundError('Пользователь', targetUserId);
      }

      // Выполняем действие модерации
      const result = await this.executeModerationAction(targetUserId, action, reason);

      // Логируем действие
      await this.auditLog('user_moderated', adminUserId, {
        targetUserId,
        action,
        reason,
        result
      });

      // Инвалидируем кэш
      await this.clearCache(`admin_dashboard:${adminUserId}`);
      await this.clearCache(`user_profile:${targetUserId}`);

      return {
        success: true,
        action,
        targetUser: targetUser.firstName + ' ' + targetUser.lastName,
        reason: reason || '',
        timestamp: new Date()
      };

    } catch (error) {
      return this.handleError(error, 'moderateUser', adminUserId);
    }
  }

  /**
   * Управление ролями администраторов
   */
  async manageAdminRole(superAdminId: string, targetUserId: string, newRole: string | null): Promise<void> {
    this.validateUserId(superAdminId);
    this.validateUserId(targetUserId);

    try {
      // Только супер-админ может управлять ролями
      const superAdmin = await this.storage.getUser(superAdminId);
      if (!superAdmin || superAdmin.adminRole !== 'super_admin') {
        throw new BusinessError('Только супер-администратор может управлять административными ролями');
      }

      // Получаем целевого пользователя
      const targetUser = await this.storage.getUser(targetUserId);
      if (!targetUser) {
        throw new NotFoundError('Пользователь', targetUserId);
      }

      // Нельзя изменять роль самого себя
      if (superAdminId === targetUserId) {
        throw new BusinessError('Нельзя изменять собственную административную роль');
      }

      // Обновляем роль
      await this.storage.updateUser(targetUserId, { adminRole: newRole });

      // Логируем изменение
      await this.auditLog('admin_role_changed', superAdminId, {
        targetUserId,
        oldRole: targetUser.adminRole,
        newRole,
        targetUserName: `${targetUser.firstName} ${targetUser.lastName}`
      });

      // Инвалидируем кэш
      await this.clearCache(`admin_dashboard:${superAdminId}`);
      await this.clearCache(`user_profile:${targetUserId}`);

    } catch (error) {
      return this.handleError(error, 'manageAdminRole', superAdminId);
    }
  }

  /**
   * Получение журнала административных действий
   */
  async getAdminAuditLog(adminUserId: string, filters?: any): Promise<AdminLog[]> {
    this.validateUserId(adminUserId);

    try {
      // Проверяем права доступа к логам
      const admin = await this.storage.getUser(adminUserId);
      if (!admin || !this.canViewAuditLog(admin.adminRole)) {
        throw new BusinessError('Недостаточно прав для просмотра журнала аудита');
      }

      // Получаем логи с фильтрацией
      const logs = await this.storage.getAdminLogs(adminUserId, filters);

      await this.auditLog('audit_log_viewed', adminUserId, { filters });
      return logs;

    } catch (error) {
      return this.handleError(error, 'getAdminAuditLog', adminUserId);
    }
  }

  /**
   * Системный мониторинг и здоровье
   */
  async getSystemHealth(): Promise<SystemHealthData> {
    try {
      // Проверяем различные компоненты системы
      const [
        databaseHealth,
        storageHealth,
        apiHealth,
        performanceMetrics
      ] = await Promise.all([
        this.checkDatabaseHealth(),
        this.checkStorageHealth(),
        this.checkAPIHealth(),
        this.getPerformanceMetrics()
      ]);

      const systemHealth: SystemHealthData = {
        overall: this.calculateOverallHealth(databaseHealth, storageHealth, apiHealth),
        database: databaseHealth,
        storage: storageHealth,
        api: apiHealth,
        performance: performanceMetrics,
        lastCheck: new Date()
      };

      return systemHealth;

    } catch (error) {
      return this.handleError(error, 'getSystemHealth');
    }
  }

  /**
   * Массовые операции с пользователями
   */
  async bulkUserOperation(adminUserId: string, userIds: string[], operation: string, params?: any): Promise<any> {
    this.validateUserId(adminUserId);

    try {
      // Проверяем права администратора
      const admin = await this.storage.getUser(adminUserId);
      if (!admin || !this.hasPermission(admin.adminRole, 'bulk_operations')) {
        throw new BusinessError('Недостаточно прав для массовых операций');
      }

      // Валидируем количество пользователей
      if (userIds.length > 100) {
        throw new ValidationError('Максимальное количество пользователей для массовой операции: 100');
      }

      // Выполняем операцию
      const results = await this.executeBulkOperation(userIds, operation, params);

      // Логируем массовую операцию
      await this.auditLog('bulk_operation', adminUserId, {
        operation,
        userCount: userIds.length,
        successCount: results.success.length,
        errorCount: results.errors.length
      });

      return results;

    } catch (error) {
      return this.handleError(error, 'bulkUserOperation', adminUserId);
    }
  }

  // ===========================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ===========================================

  /**
   * Проверка прав доступа для конкретного действия
   */
  private hasPermission(adminRole: string | null, action: string): boolean {
    if (!adminRole) return false;

    const permissions: Record<string, string[]> = {
      'super_admin': ['*'], // Все права
      'security_admin': ['moderate_user', 'view_logs', 'manage_documents'],
      'finance_admin': ['view_financial_data', 'manage_transactions'],
      'analytics_admin': ['view_analytics', 'export_data'],
      'api_admin': ['manage_integrations', 'view_api_logs'],
      'devops_admin': ['view_system_health', 'manage_infrastructure']
    };

    const rolePermissions = permissions[adminRole] || [];
    return rolePermissions.includes('*') || rolePermissions.includes(action);
  }

  /**
   * Проверка права просмотра журнала аудита
   */
  private canViewAuditLog(adminRole: string | null): boolean {
    const allowedRoles: string[] = ['super_admin', 'security_admin'];
    return adminRole !== null && allowedRoles.includes(adminRole);
  }

  /**
   * Выполнение действия модерации
   */
  private async executeModerationAction(userId: string, action: string, reason?: string): Promise<any> {
    switch (action) {
      case 'block':
        return await this.storage.updateUser(userId, { role: 'blocked' });
      case 'unblock':
        return await this.storage.updateUser(userId, { role: 'personal' });
      case 'verify':
        return await this.storage.updateUser(userId, { isVerified: true });
      case 'unverify':
        return await this.storage.updateUser(userId, { isVerified: false });
      default:
        throw new ValidationError(`Неподдерживаемое действие модерации: ${action}`);
    }
  }

  /**
   * Получение статистики пользователей по ролям
   */
  private async getUsersByRoleStats(): Promise<Record<string, number>> {
    // В реальности здесь будет запрос к БД с группировкой
    return {
      personal: 150,
      family: 45,
      business: 12
    };
  }

  /**
   * Получение финансовой статистики
   */
  private async getFinancialStats(): Promise<any> {
    // В реальности здесь будет агрегация финансовых данных
    return {
      totalBalance: 1500000,
      transactionsToday: 234,
      averageTransaction: 2500
    };
  }

  /**
   * Получение данных здоровья системы
   */
  private async getSystemHealthData(): Promise<any> {
    return {
      overall: 'healthy',
      components: {
        database: 'healthy',
        storage: 'healthy',
        api: 'warning'
      }
    };
  }

  /**
   * Получение сегодняшней даты
   */
  private getTodayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  /**
   * Проверка здоровья базы данных
   */
  private async checkDatabaseHealth(): Promise<'healthy' | 'warning' | 'error'> {
    try {
      // Простая проверка подключения к БД
      await this.storage.getTotalUsersCount();
      return 'healthy';
    } catch (error) {
      return 'error';
    }
  }

  /**
   * Проверка здоровья хранилища
   */
  private async checkStorageHealth(): Promise<'healthy' | 'warning' | 'error'> {
    // Заглушка для проверки файлового хранилища
    return 'healthy';
  }

  /**
   * Проверка здоровья API
   */
  private async checkAPIHealth(): Promise<'healthy' | 'warning' | 'error'> {
    // Заглушка для проверки внешних API
    return 'warning';
  }

  /**
   * Получение метрик производительности
   */
  private async getPerformanceMetrics(): Promise<any> {
    return {
      responseTime: 150,
      throughput: 1000,
      errorRate: 0.5
    };
  }

  /**
   * Расчет общего здоровья системы
   */
  private calculateOverallHealth(db: string, storage: string, api: string): 'healthy' | 'warning' | 'error' {
    const statuses = [db, storage, api];
    
    if (statuses.includes('error')) return 'error';
    if (statuses.includes('warning')) return 'warning';
    return 'healthy';
  }

  /**
   * Выполнение массовой операции
   */
  private async executeBulkOperation(userIds: string[], operation: string, params?: any): Promise<any> {
    const results = {
      success: [] as string[],
      errors: [] as { userId: string; error: string }[]
    };

    for (const userId of userIds) {
      try {
        await this.executeModerationAction(userId, operation);
        results.success.push(userId);
      } catch (error) {
        results.errors.push({
          userId,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }
}

// Экспортируем singleton instance
export const adminService = new AdminService();