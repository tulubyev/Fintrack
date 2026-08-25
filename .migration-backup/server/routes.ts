import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { authService } from "./services/authService";
// twoFactorService moved to: server/routes/auth.ts
import { bankService } from "./services/bankService";
import { bankApiService } from "./services/bankApiService";
import { paymentService } from "./services/paymentService";
// aiService moved to: server/routes/ai.ts
// testingService moved to: server/routes/test.ts
// esiaService moved to: server/routes/esia.ts
import { smsService } from "./services/smsService";
import { emailService } from "./services/emailService";
import { verificationService } from "./services/verificationService";
import { requireAdmin, requirePermission, getAdminSections, hasPermission } from "./middleware/adminAuth";
import { documentStorageService } from "./services/documentStorageService";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import multer from 'multer';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// AuthenticatedRequest импортируется из middleware/auth.ts

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each user to 100 requests per windowMs
  message: "Слишком много запросов, попробуйте позже",
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: "Слишком много попыток входа, попробуйте позже",
});

// Multer configuration for file uploads  
const upload = multer({
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for documents
  },
  fileFilter: (req, file, cb) => {
    // Для загрузки фото профиля - только изображения
    if (req.url === '/api/profile/upload-image') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Только изображения разрешены'));
      }
    }
    // Для загрузки документов - изображения и PDF
    else if (req.url === '/api/documents/upload') {
      const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf'
      ];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Разрешены только изображения и PDF файлы'));
      }
    } else {
      cb(null, true);
    }
  },
  storage: multer.memoryStorage()
});

// Импортируем общий auth middleware
import { authenticateToken, type AuthenticatedRequest } from "./middleware/auth";

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Неверный формат email').optional().or(z.literal('').transform(() => undefined)),
  password: z.string().min(6, 'Пароль должен содержать минимум 6 символов'),
  firstName: z.string().min(1, 'Имя обязательно'),
  lastName: z.string().min(1, 'Фамилия обязательна'),
  phone: z.string().min(10, 'Номер телефона обязателен (минимум 10 цифр)').regex(/^\+?[1-9]\d{9,14}$/, 'Неверный формат номера телефона'),
});

const loginSchema = z.object({
  identifier: z.string().min(1, 'Введите email или телефон'),
  password: z.string().min(1, 'Пароль обязателен'),
  twoFactorCode: z.string().optional(),
});

// 2FA schemas moved to: server/routes/auth.ts

// Savings & Budget validation schemas moved to: server/routes/savings-budgets.ts

export async function registerRoutes(app: Express): Promise<Server> {
  // Apply rate limiting to all API routes
  app.use('/api', apiLimiter);
  
  // Подключаем модульные роутеры
  const mainRouter = await import('./routes/index.js');
  app.use('/api', mainRouter.default);

  // ALL AUTH ROUTES NOW IN MODULAR ROUTER: server/routes/auth.ts 
  // (удалены дублированные auth роуты для предотвращения конфликтов)

  // ALL VERIFICATION ROUTES NOW IN MODULAR ROUTER: server/routes/verification.ts 
  // (удалены дублированные verification роуты для предотвращения конфликтов)

  // ALL DASHBOARD ROUTES NOW IN MODULAR ROUTER: server/routes/dashboard.ts 
  // (удалены дублированные dashboard роуты для предотвращения конфликтов)

  // ALL BANK CONNECTION, PAYMENT, ACCOUNT & TRANSACTION ROUTES NOW IN MODULAR ROUTER: server/routes/banks.ts 
  // (удалены дублированные banks/payments роуты для предотвращения конфликтов)

  // ALL PROFILE ROUTES NOW IN MODULAR ROUTER: server/routes/profile.ts 
  // (удалены profile роуты для предотвращения конфликтов)

  // Legacy support for old profile images path (backward compatibility)
  app.get('/uploads/profile-images/:filename', (req: Request, res: Response) => {
    try {
      const filename = req.params.filename;
      const filePath = path.join(__dirname, 'uploads', 'profile-images', filename);
      
      // Security check: only allow files with safe names
      if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png)$/i.test(filename)) {
        return res.status(400).json({ message: 'Недопустимое имя файла' });
      }

      res.sendFile(filePath, (err) => {
        if (err) {
          res.status(404).json({ message: 'Изображение не найдено' });
        }
      });
    } catch (error) {
      console.error('Error serving profile image:', error);
      res.status(500).json({ message: 'Ошибка получения изображения' });
    }
  });

  // ALL DOCUMENTS ROUTES NOW IN MODULAR ROUTER: server/routes/documents.ts 
  // (удалены дублированные documents роуты для предотвращения конфликтов)

  // Administrative routes for document storage monitoring
  app.get('/api/admin/storage/info', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
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

  // ALL DUPLICATE BANK/PAYMENT/ACCOUNT/TRANSACTION ROUTES MOVED TO: server/routes/banks.ts 
  // (второй блок дублированных банковских роутов удален для предотвращения конфликтов)

  // ALL SAVINGS & BUDGET ROUTES NOW IN MODULAR ROUTER: server/routes/savings-budgets.ts 
  // (удалены savings/budget роуты для предотвращения конфликтов)

  // ALL 2FA AND SMS ROUTES NOW IN MODULAR ROUTER: server/routes/auth.ts 
  // (удалены дублированные auth 2FA/SMS роуты для предотвращения конфликтов)

  // ALL AI ASSISTANT ROUTES NOW IN MODULAR ROUTER: server/routes/ai.ts 
  // (удалены AI роуты для предотвращения конфликтов)

  // ALL TESTING ROUTES NOW IN MODULAR ROUTER: server/routes/test.ts 
  // (удалены test роуты для предотвращения конфликтов)

  // ALL ESIA (ГОСУСЛУГИ) ROUTES NOW IN MODULAR ROUTER: server/routes/esia.ts 
  // (удалены ESIA роуты для предотвращения конфликтов)

  // ===========================================
  // ADMIN PANEL API ENDPOINTS
  // ===========================================

  // Get admin permissions and sections
  app.get('/api/admin/profile', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  // Get pending documents for moderation (admin only)
  app.get('/api/admin/documents/pending', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const pendingDocuments = await storage.getPendingDocuments();
      res.json(pendingDocuments);
    } catch (error) {
      console.error('Error fetching pending documents:', error);
      res.status(500).json({ message: 'Ошибка получения документов на модерацию' });
    }
  });

  // Get archived documents for admin (verified/rejected)
  app.get('/api/admin/documents/archived', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const archivedDocuments = await storage.getArchivedDocuments();
      res.json(archivedDocuments);
    } catch (error) {
      console.error('Error fetching archived documents:', error);
      res.status(500).json({ message: 'Ошибка получения архивных документов' });
    }
  });

  // View document endpoint for admin
  app.get('/api/documents/:id/view', authenticateToken, async (req: AuthenticatedRequest, res) => {
    try {
      const { id } = req.params;
      
      // Получаем информацию о документе
      const document = await storage.getDocumentById(id);
      if (!document) {
        return res.status(404).json({ message: 'Документ не найден' });
      }

      // Проверяем права доступа (только админы или владелец документа)
      const user = req.user!;
      const isAdmin = user.role && ['super_admin', 'security_admin', 'api_admin'].includes(user.role);
      const isOwner = document.userId === user.id;
      
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ message: 'Недостаточно прав для просмотра документа' });
      }

      // Отправляем файл
      const filePath = document.filePath;
      if (filePath.startsWith('/objects/')) {
        // Это object storage файл
        res.redirect(`${filePath}?token=${req.headers.authorization?.split(' ')[1]}`);
      } else {
        // Локальный файл
        res.sendFile(filePath);
      }
    } catch (error) {
      console.error('Error viewing document:', error);
      res.status(500).json({ message: 'Ошибка при просмотре документа' });
    }
  });

  // System monitoring endpoints
  app.get('/api/admin/system/metrics', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const metrics = await storage.getSystemMetrics();
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching system metrics:', error);
      res.status(500).json({ message: 'Ошибка получения системных метрик' });
    }
  });
  
  app.get('/api/admin/system/health', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const health = await storage.getSystemHealth();
      res.json(health);
    } catch (error) {
      console.error('Error fetching system health:', error);
      res.status(500).json({ message: 'Ошибка получения статуса системы' });
    }
  });
  
  app.get('/api/admin/system/logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getRecentLogs(limit);
      res.json(logs);
    } catch (error) {
      console.error('Error fetching system logs:', error);
      res.status(500).json({ message: 'Ошибка получения системных логов' });
    }
  });

  // Enhanced admin dashboard metrics
  app.get('/api/admin/dashboard/metrics', authenticateToken, requirePermission('dashboard.analytics'), async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/admin/users/analytics', authenticateToken, requirePermission('users.analytics'), async (req: AuthenticatedRequest, res) => {
    try {
      const analytics = await storage.getUserAnalytics();
      res.json(analytics);
    } catch (error) {
      res.status(500).json({ message: 'Ошибка получения аналитики пользователей' });
    }
  });

  // Financial data for finance admin  
  app.get('/api/admin/finances/overview', authenticateToken, requirePermission('transactions.view'), async (req: AuthenticatedRequest, res) => {
    try {
      const overview = await storage.getFinancialOverview();
      res.json(overview);
    } catch (error) {
      res.status(500).json({ message: 'Ошибка получения финансовых данных' });
    }
  });

  // API monitoring for API admin
  app.get('/api/admin/api/status', authenticateToken, requirePermission('api.monitoring'), async (req: AuthenticatedRequest, res) => {
    try {
      const apiStatus = await storage.getApiStatus();
      res.json(apiStatus);
    } catch (error) {
      res.status(500).json({ message: 'Ошибка получения статуса API' });
    }
  });

  // Security monitoring for security admin
  app.get('/api/admin/security/overview', authenticateToken, requirePermission('security.monitoring'), async (req: AuthenticatedRequest, res) => {
    try {
      const securityData = await storage.getSecurityOverview();
      res.json(securityData);
    } catch (error) {
      res.status(500).json({ message: 'Ошибка получения данных безопасности' });
    }
  });

  // System monitoring for devops admin
  app.get('/api/admin/system/health', authenticateToken, requirePermission('system.monitoring'), async (req: AuthenticatedRequest, res) => {
    try {
      const health = await storage.getSystemHealth();
      res.json(health);
    } catch (error) {
      res.status(500).json({ message: 'Ошибка получения состояния системы' });
    }
  });

  // Admin logs (все админы могут видеть свои действия, super admin - все)
  app.get('/api/admin/logs', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { page = 1, limit = 50 } = req.query;
      const userId = req.user!.adminRole === 'super_admin' ? undefined : req.user!.id;
      
      const logs = await storage.getAdminLogs(userId, Number(page), Number(limit));
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: 'Ошибка получения логов' });
    }
  });

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
  // SUPER ADMIN USER MANAGEMENT
  // ===========================================

  // Get all users for super admin
  app.get('/api/admin/users', authenticateToken, requirePermission('users.manage'), async (req: AuthenticatedRequest, res) => {
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
  app.patch('/api/admin/users/:userId/role', authenticateToken, async (req: AuthenticatedRequest, res) => {
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

  // Get user details for admin
  app.get('/api/admin/users/:userId', authenticateToken, requirePermission('users.manage'), async (req: AuthenticatedRequest, res) => {
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
  app.get('/api/admin/roles', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res) => {
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

  // AI Chat endpoint moved to: server/routes/ai.ts

  const httpServer = createServer(app);
  return httpServer;
}
