import { NextFunction } from 'express';
import { User } from '@shared/schema';
import { 
  AuthenticatedRequest, 
  AsyncMiddleware,
  ADMIN_PERMISSIONS, 
  Permission,
  AdminRoleString,
  ErrorCodes
} from './types';
import { AuthorizationError, asyncHandler } from './errorHandler';

/**
 * Middleware для проверки, что пользователь является админом
 */
export const requireAdmin: AsyncMiddleware<AuthenticatedRequest> = asyncHandler(
  async (req: AuthenticatedRequest, res, next) => {
    if (!req.user) {
      throw new AuthorizationError('Требуется аутентификация', ErrorCodes.TOKEN_MISSING);
    }

    const user = req.user as User;
    if (!user.adminRole) {
      throw new AuthorizationError('Требуется роль администратора', ErrorCodes.ADMIN_REQUIRED);
    }

    next();
  }
);

/**
 * Middleware для проверки конкретных прав доступа
 */
export const requirePermission = (permission: Permission) => {
  const middleware: AsyncMiddleware<AuthenticatedRequest> = asyncHandler(
    async (req: AuthenticatedRequest, res, next) => {
      if (!req.user) {
        throw new AuthorizationError('Требуется аутентификация', ErrorCodes.TOKEN_MISSING);
      }

      const user = req.user as User;
      if (!user.adminRole) {
        throw new AuthorizationError('Требуется роль администратора', ErrorCodes.ADMIN_REQUIRED);
      }

      // Super admin имеет все права
      if (user.adminRole === 'super_admin') {
        return next();
      }

      // Проверяем права конкретной роли
      const rolePermissions = ADMIN_PERMISSIONS[user.adminRole as AdminRoleString];
      if (!rolePermissions || !(rolePermissions as readonly string[]).includes(permission as string)) {
        throw new AuthorizationError(
          `Недостаточно прав. Требуется разрешение '${permission}'`,
          ErrorCodes.PERMISSION_DENIED
        );
      }

      next();
    }
  );

  return middleware;
};

// Функция для проверки наличия права у пользователя
export const hasPermission = (user: User, permission: Permission): boolean => {
  if (!user.adminRole) return false;
  if (user.adminRole === 'super_admin') return true;
  
  const rolePermissions = ADMIN_PERMISSIONS[user.adminRole as AdminRoleString];
  return (rolePermissions as readonly string[])?.includes(permission as string) || false;
};

// Получить все доступные разделы для админа
export const getAdminSections = (user: User) => {
  if (!user.adminRole) return [];
  
  const sections = [];
  
  if (hasPermission(user, 'dashboard.analytics') || user.adminRole === 'super_admin') {
    sections.push('dashboard');
  }
  
  if (hasPermission(user, 'users.analytics') || hasPermission(user, 'users.manage') || user.adminRole === 'super_admin') {
    sections.push('users');
  }
  
  if (hasPermission(user, 'transactions.view') || user.adminRole === 'super_admin') {
    sections.push('finances');
  }
  
  if (hasPermission(user, 'api.monitoring') || user.adminRole === 'super_admin') {
    sections.push('api');
  }
  
  if (hasPermission(user, 'security.monitoring') || user.adminRole === 'super_admin') {
    sections.push('security');
  }
  
  if (hasPermission(user, 'system.monitoring') || user.adminRole === 'super_admin') {
    sections.push('system');
  }
  
  return sections;
};