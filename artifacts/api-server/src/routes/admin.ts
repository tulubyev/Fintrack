import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { authenticateToken, type AuthenticatedRequest } from "../middleware/auth";
import { requireAdmin, requirePermission, getAdminSections, hasPermission } from "../middleware/adminAuth";
import { documentStorageService } from "../services/documentStorageService";
import { adminService } from "../services/AdminService";
import { documentService } from "../services/DocumentService";
import { getMetrics, checkAlerts, getSystemHealth, getPerformanceStats } from "../middleware/metrics";
import { getCacheStats } from "../middleware/caching";
import { tokenCache } from "../services/tokenCache";

const adminRouter = Router();

// Cache stats helper functions
interface CacheStatsInput {
  hits: number;
  misses: number;
  hitRate: number;
}

const calculateOverallHitRate = (
  httpCache: CacheStatsInput, 
  tokenCache: CacheStatsInput, 
  metricsCache: CacheStatsInput
): number => {
  const totalHits = httpCache.hits + tokenCache.hits + metricsCache.hits;
  const totalMisses = httpCache.misses + tokenCache.misses + metricsCache.misses;
  const total = totalHits + totalMisses;
  return total > 0 ? Math.round((totalHits / total) * 100 * 100) / 100 : 0;
};

const getCacheHealthStatus = (
  httpCache: CacheStatsInput, 
  tokenCache: CacheStatsInput
): 'healthy' | 'warming' | 'cold' | 'degraded' => {
  const avgHitRate = (httpCache.hitRate + tokenCache.hitRate) / 2;
  const totalRequests = httpCache.hits + httpCache.misses + tokenCache.hits + tokenCache.misses;
  
  if (totalRequests < 10) return 'cold';
  if (avgHitRate >= 60) return 'healthy';
  if (avgHitRate >= 30) return 'warming';
  return 'degraded';
};

// Admin actions logging helper
const logAdminAction = async (userId: string, action: string, targetType?: string, targetId?: string, details?: any, req?: Request) => {
  try {
    await storage.createAdminLog({
      adminUserId: userId,
      action,
      targetType,
      targetId,
      details,
      ipAddress: req?.ip || 'unknown',
      userAgent: req?.get('User-Agent') || 'unknown'
    });
  } catch (error) {
    console.error('Ошибка логирования действия админа:', error);
  }
};

// ===========================================
// ADMIN STORAGE & SYSTEM MONITORING
// ===========================================

// Administrative routes for document storage monitoring
adminRouter.get('/storage/info', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const storageInfo = await documentStorageService.getStorageInfo();
    res.json({
      ...storageInfo,
      totalSizeMB: Math.round(storageInfo.totalSize / (1024 * 1024) * 100) / 100,
      securityFeatures: [
        'AES-256 encryption',
        'File integrity verification (SHA-256)',
        'Access control (user-based)',
        'Secure file paths',
        'Directory permissions (700)',
        'Path traversal protection'
      ]
    });
  } catch (error) {
    console.error('Storage info error:', error);
    res.status(500).json({ message: 'Ошибка получения информации о хранилище' });
  }
});

// System monitoring endpoints - ПРОДВИНУТАЯ СИСТЕМА МОНИТОРИНГА
adminRouter.get('/system/metrics', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = getMetrics();
    const alerts = checkAlerts();
    const performanceStats = getPerformanceStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      metrics,
      alerts,
      performanceStats,
      status: alerts.length === 0 ? 'healthy' : 'warning'
    });
  } catch (error) {
    console.error('Error fetching advanced system metrics:', error);
    res.status(500).json({ message: 'Ошибка получения продвинутых системных метрик' });
  }
});

adminRouter.get('/system/health', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const health = getSystemHealth();
    const metrics = getMetrics();
    
    res.json({
      ...health,
      detailed: {
        uptime: metrics.uptime,
        totalRequests: metrics.totalRequests,
        averageResponseTime: metrics.averageResponseTime,
        errorRate: metrics.errors.rate,
        cacheHitRate: metrics.cache.hitRate,
        memory: metrics.performance.memory,
        cpu: metrics.performance.cpu
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching enhanced system health:', error);
    res.status(500).json({ message: 'Ошибка получения расширенного статуса системы' });
  }
});

// Информация о системе для админ-панели
adminRouter.get('/system/info', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = getMetrics();
    const uptime = process.uptime();
    
    // Форматируем uptime в человеко-читаемый формат
    const days = Math.floor(uptime / (60 * 60 * 24));
    const hours = Math.floor((uptime % (60 * 60 * 24)) / (60 * 60));
    const uptimeStr = `${days} дн${days !== 1 ? '' : ''} ${hours} ч`;
    
    res.json({
      version: process.env.APP_VERSION || '2.1.3',
      environment: process.env.NODE_ENV || 'production',
      uptime: uptimeStr,
      lastUpdate: new Date().toISOString(),
      dbConnections: metrics.database?.connectionCount || 0,
      maxDbConnections: parseInt(process.env.MAX_DB_CONNECTIONS || '10'),
      memoryUsage: Math.round((metrics.performance.memory / 1024 / 1024 / 512) * 100) // Примерный процент от 512MB
    });
  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({ message: 'Ошибка получения информации о системе' });
  }
});

// ===========================================
// НОВЫЕ ENDPOINTS ДЛЯ ВИЗУАЛИЗАЦИИ МОНИТОРИНГА
// ===========================================

// Активные алерты для дашборда
adminRouter.get('/monitoring/alerts', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const alerts = checkAlerts();
    const metrics = getMetrics();
    
    res.json({
      alerts,
      summary: {
        total: alerts.length,
        high: alerts.filter(a => a.severity === 'high').length,
        medium: alerts.filter(a => a.severity === 'medium').length,
        low: alerts.filter(a => a.severity === 'low').length
      },
      currentStats: {
        errorRate: metrics.errors.rate,
        responseTime: metrics.averageResponseTime,
        cacheHitRate: metrics.cache.hitRate,
        memoryUsage: Math.round(metrics.performance.memory / 1024 / 1024)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching monitoring alerts:', error);
    res.status(500).json({ message: 'Ошибка получения алертов мониторинга' });
  }
});

// Real-time метрики для live обновлений
adminRouter.get('/monitoring/realtime', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics: any = getMetrics();
    const performanceStats = getPerformanceStats();
    
    res.json({
      timestamp: new Date().toISOString(),
      realtime: {
        requestsPerMinute: metrics.requestsPerMinute,
        activeConnections: metrics.activeConnections || 0,
        responseTime: metrics.averageResponseTime,
        errorRate: metrics.errors.rate,
        cacheStats: {
          hitRate: metrics.cache.hitRate,
          missRate: 100 - metrics.cache.hitRate,
          size: metrics.cache.size,
          operations: metrics.cache.operations
        },
        performance: {
          cpu: metrics.performance.cpu,
          memory: Math.round(metrics.performance.memory / 1024 / 1024),
          heapUsed: Math.round(metrics.performance.heapUsed / 1024 / 1024),
          uptime: metrics.uptime
        }
      },
      trends: performanceStats
    });
  } catch (error) {
    console.error('Error fetching realtime metrics:', error);
    res.status(500).json({ message: 'Ошибка получения real-time метрик' });
  }
});

// Детальная аналитика производительности
adminRouter.get('/monitoring/performance', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics: any = getMetrics();
    const timeRange = req.query.range as string || '1h';
    
    res.json({
      timeRange,
      performance: {
        requests: {
          total: metrics.totalRequests,
          perMinute: metrics.requestsPerMinute,
          breakdown: metrics.endpoints || {}
        },
        responses: {
          average: metrics.averageResponseTime,
          p95: metrics.p95ResponseTime || 0,
          p99: metrics.p99ResponseTime || 0,
          slowest: metrics.slowestEndpoint || 'N/A'
        },
        errors: {
          rate: metrics.errors.rate,
          total: metrics.errors.total,
          byType: metrics.errors.byType || {},
          recent: metrics.errors.recent || []
        },
        database: {
          connectionCount: metrics.database.connectionCount,
          queryCount: metrics.database.queryCount,
          averageQueryTime: metrics.database.averageQueryTime,
          slowQueries: metrics.database.slowQueries
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching performance analytics:', error);
    res.status(500).json({ message: 'Ошибка получения аналитики производительности' });
  }
});

adminRouter.get('/system/logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const logs = await storage.getRecentLogs(limit);
    res.json(logs);
  } catch (error) {
    console.error('Error fetching system logs:', error);
    res.status(500).json({ message: 'Ошибка получения системных логов' });
  }
});

adminRouter.get('/cache-stats', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const httpCacheStats = getCacheStats();
    const tokenCacheStats = tokenCache.getStats();
    const metrics = getMetrics();
    
    res.json({
      timestamp: new Date().toISOString(),
      httpCache: {
        ...httpCacheStats,
        memoryUsageMB: Math.round(httpCacheStats.memoryUsage / 1024 / 1024 * 100) / 100
      },
      tokenCache: {
        ...tokenCacheStats,
        status: tokenCacheStats.hitRate > 50 ? 'healthy' : 
                tokenCacheStats.hitRate > 20 ? 'warming' : 'cold'
      },
      metricsCache: {
        hits: metrics.cache.hits,
        misses: metrics.cache.misses,
        hitRate: metrics.cache.hitRate,
        entryCount: metrics.cache.entryCount,
        memoryUsage: metrics.cache.memoryUsage
      },
      summary: {
        totalHits: httpCacheStats.hits + tokenCacheStats.hits + metrics.cache.hits,
        totalMisses: httpCacheStats.misses + tokenCacheStats.misses + metrics.cache.misses,
        overallHitRate: calculateOverallHitRate(httpCacheStats, tokenCacheStats, metrics.cache),
        healthStatus: getCacheHealthStatus(httpCacheStats, tokenCacheStats)
      }
    });
  } catch (error) {
    console.error('Error fetching cache stats:', error);
    res.status(500).json({ message: 'Ошибка получения статистики кэша' });
  }
});

// ===========================================
// ADMIN PROFILE & PERMISSIONS
// ===========================================

// Get admin permissions and sections
adminRouter.get('/profile', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    const sections = getAdminSections(user);
    
    res.json({
      adminRole: user.adminRole,
      sections,
      permissions: {
        canViewDashboard: hasPermission(user, 'dashboard.analytics'),
        canViewUsers: hasPermission(user, 'users.analytics'),
        canViewFinances: hasPermission(user, 'transactions.view'),
        canViewAPI: hasPermission(user, 'api.monitoring'),
        canViewSecurity: hasPermission(user, 'security.monitoring'),
        canViewSystem: hasPermission(user, 'system.monitoring'),
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения профиля админа' });
  }
});

// ===========================================
// ADMIN DOCUMENTS MANAGEMENT
// ===========================================

// Get pending documents for moderation (admin only)
adminRouter.get('/documents/pending', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const pendingDocuments = await documentService.getPendingDocuments();
    res.json(pendingDocuments);
  } catch (error) {
    console.error('Error fetching pending documents:', error);
    res.status(500).json({ message: 'Ошибка получения документов на модерацию' });
  }
});

// Get archived documents for admin (verified/rejected)
adminRouter.get('/documents/archived', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const archivedDocuments = await storage.getArchivedDocuments();
    res.json(archivedDocuments);
  } catch (error) {
    console.error('Error fetching archived documents:', error);
    res.status(500).json({ message: 'Ошибка получения архивных документов' });
  }
});

// ===========================================
// ENHANCED ADMIN DASHBOARD & ANALYTICS
// ===========================================

// Enhanced admin dashboard metrics
adminRouter.get('/dashboard/metrics', authenticateToken, requirePermission('dashboard.analytics'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await storage.getAdminStats();
    
    // Системные метрики (только для devops и super admin)
    let systemMetrics = null;
    if (hasPermission(req.user!, 'system.monitoring')) {
      systemMetrics = await storage.getSystemMetrics();
    }

    res.json({
      ...stats,
      systemMetrics
    });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения метрик' });
  }
});

// User analytics for analytics admin
adminRouter.get('/users/analytics', authenticateToken, requirePermission('users.analytics'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const analytics = await storage.getUserAnalytics();
    res.json(analytics);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения аналитики пользователей' });
  }
});

// Financial data for finance admin  
adminRouter.get('/finances/overview', authenticateToken, requirePermission('transactions.view'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const overview = await storage.getFinancialOverview();
    res.json(overview);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения финансовых данных' });
  }
});

// API monitoring for API admin
adminRouter.get('/api/status', authenticateToken, requirePermission('api.monitoring'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const apiStatus = await storage.getApiStatus();
    res.json(apiStatus);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения статуса API' });
  }
});

// Security monitoring for security admin
adminRouter.get('/security/overview', authenticateToken, requirePermission('security.monitoring'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const securityData = await storage.getSecurityOverview();
    res.json(securityData);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения данных безопасности' });
  }
});

// Admin logs (все админы могут видеть свои действия, super admin - все)
adminRouter.get('/logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user!.adminRole === 'super_admin' ? undefined : req.user!.id;
    
    const logs = await storage.getAdminLogs(userId, { page: Number(page), limit: Number(limit) });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения логов' });
  }
});

// ===========================================
// SUPER ADMIN USER MANAGEMENT
// ===========================================

// Get all users for super admin
adminRouter.get('/users', authenticateToken, requirePermission('users.manage'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const users = await storage.getAllUsers(Number(page), Number(limit), search as string);
    
    await logAdminAction(req.user!.id, 'users_list_viewed', 'admin_panel', undefined, { page, limit, search }, req);
    
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения списка пользователей' });
  }
});

// Update user admin role (super admin only)
adminRouter.patch('/users/:userId/role', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Только супер админ может назначать роли
    if (req.user!.adminRole !== 'super_admin') {
      return res.status(403).json({ message: 'Только супер админ может назначать роли' });
    }

    const { userId } = req.params;
    const { adminRole } = req.body;

    // Валидация роли
    const validRoles = ['super_admin', 'devops_admin', 'analytics_admin', 'finance_admin', 'api_admin', 'security_admin'];
    if (adminRole && !validRoles.includes(adminRole)) {
      return res.status(400).json({ message: 'Недопустимая админская роль' });
    }

    // Проверяем, что пользователь существует
    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Обновляем роль
    const updatedUser = await storage.updateUser(userId, { adminRole: adminRole || null });
    
    // Логируем действие
    await logAdminAction(
      req.user!.id, 
      'user_role_updated', 
      'user', 
      userId, 
      { 
        previousRole: targetUser.adminRole,
        newRole: adminRole || null,
        targetUserName: `${targetUser.firstName} ${targetUser.lastName}`,
        targetUserPhone: targetUser.phone
      }, 
      req
    );

    res.json({ 
      message: `Роль пользователя ${targetUser.firstName} ${targetUser.lastName} успешно ${adminRole ? 'назначена' : 'удалена'}`,
      user: updatedUser 
    });
  } catch (error) {
    console.error('Ошибка обновления роли пользователя:', error);
    res.status(500).json({ message: 'Ошибка обновления роли пользователя' });
  }
});

// Update user data (super admin only)
adminRouter.patch('/users/:userId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user!.adminRole !== 'super_admin') {
      return res.status(403).json({ message: 'Только супер админ может редактировать данные пользователей' });
    }

    const { userId } = req.params;
    const { role, planType, firstName, lastName, email, phone, address, birthDate, snils, inn } = req.body;

    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const validRoles = ['personal', 'premium', 'family_admin', 'family_member', 'business'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ message: 'Недопустимый тип аккаунта' });
    }

    const updates: any = {};
    if (role) updates.role = role;
    if (planType) updates.planType = planType;
    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (address !== undefined) updates.address = address;
    if (birthDate !== undefined) updates.birthDate = birthDate ? new Date(birthDate) : null;
    if (snils !== undefined) updates.snils = snils;
    if (inn !== undefined) updates.inn = inn;

    const updatedUser = await storage.updateUser(userId, updates);

    await logAdminAction(
      req.user!.id, 
      'user_data_updated', 
      'user', 
      userId, 
      { 
        updates,
        targetUserName: `${targetUser.firstName} ${targetUser.lastName}`,
        targetUserPhone: targetUser.phone
      }, 
      req
    );

    res.json({ 
      message: 'Данные пользователя успешно обновлены',
      user: updatedUser 
    });
  } catch (error) {
    console.error('Ошибка обновления данных пользователя:', error);
    res.status(500).json({ message: 'Ошибка обновления данных пользователя' });
  }
});

// Get user details for admin
adminRouter.get('/users/:userId', authenticateToken, requirePermission('users.manage'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await storage.getUserDetails(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    await logAdminAction(req.user!.id, 'user_details_viewed', 'user', userId, undefined, req);
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения данных пользователя' });
  }
});

// Get available admin roles
adminRouter.get('/roles', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const roles = [
      { value: 'super_admin', label: 'Супер Администратор', description: 'Полный доступ ко всем функциям системы' },
      { value: 'devops_admin', label: 'DevOps Администратор', description: 'Управление инфраструктурой и системными ресурсами' },
      { value: 'analytics_admin', label: 'Аналитический Администратор', description: 'Доступ к аналитике и отчетам' },
      { value: 'finance_admin', label: 'Финансовый Администратор', description: 'Управление финансовыми операциями' },
      { value: 'api_admin', label: 'API Администратор', description: 'Мониторинг API и интеграций' },
      { value: 'security_admin', label: 'Администратор Безопасности', description: 'Управление безопасностью системы' }
    ];
    
    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения ролей' });
  }
});

export default adminRouter;