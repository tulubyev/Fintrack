import { BaseService, ValidationError, BusinessError, NotFoundError } from "./BaseService";
import type { 
  IUserService, 
  UserProfile, 
  ProfileUpdates, 
  AuthResult,
  VerificationProcess,
  VerificationResult 
} from "./interfaces";
import type { User, InsertUser } from "@shared/schema";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

/**
 * UserService - сервис для управления пользователями
 * Инкапсулирует всю бизнес-логику работы с пользователями
 */
export class UserService extends BaseService implements IUserService {

  /**
   * Получение агрегированного профиля пользователя
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    this.validateUserId(userId);

    try {
      // Проверяем кэш
      const cacheKey = `user_profile:${userId}`;
      const cached = await this.getFromCache<UserProfile>(cacheKey);
      if (cached) {
        await this.auditLog('getUserProfile_cached', userId);
        return cached;
      }

      // Получаем базовые данные пользователя
      const user = await this.storage.getUser(userId);
      if (!user) {
        throw new NotFoundError('Пользователь', userId);
      }

      // Агрегируем дополнительные данные
      const [
        documents,
        bankConnections,
        totalBalance
      ] = await Promise.all([
        this.storage.getUserDocuments ? this.storage.getUserDocuments(userId) : [],
        this.storage.getBankConnections(userId),
        this.storage.getTotalBalance(userId).catch(() => "0.00")
      ]);

      // Формируем агрегированный профиль
      const profile: UserProfile = {
        id: user.id,
        email: user.email || '',
        phone: user.phone || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        role: user.role || 'personal',
        planType: user.planType || 'free',
        isVerified: user.isVerified || false,
        documentsVerified: documents.length > 0 && documents.every(d => d.status === 'verified'),
        banksConnected: bankConnections.length,
        totalBalance: totalBalance,
        createdAt: user.createdAt || new Date(),
      };

      // Кэшируем результат на 5 минут
      await this.setCache(cacheKey, profile, 300);

      await this.auditLog('getUserProfile', userId);
      return profile;

    } catch (error) {
      return this.handleError(error, 'getUserProfile', userId);
    }
  }

  /**
   * Обновление профиля пользователя с валидацией
   */
  async updateUserProfile(userId: string, updates: ProfileUpdates): Promise<User> {
    this.validateUserId(userId);

    try {
      // Валидируем обновления
      await this.validateProfileUpdates(updates);

      // Получаем текущие данные для аудита
      const oldUser = await this.storage.getUser(userId);
      if (!oldUser) {
        throw new NotFoundError('Пользователь', userId);
      }

      // Обновляем пользователя
      const updatedUser = await this.storage.updateUser(userId, updates);
      if (!updatedUser) {
        throw new BusinessError('Не удалось обновить профиль пользователя');
      }

      // Инвалидируем кэш
      await this.clearCache(`user_profile:${userId}`);

      // Логируем изменения
      await this.auditLog('updateUserProfile', userId, {
        changes: this.getChanges(oldUser, updates),
        oldData: {
          email: oldUser.email,
          phone: oldUser.phone,
          firstName: oldUser.firstName,
          lastName: oldUser.lastName
        }
      });

      // Отправляем уведомления о важных изменениях
      if (updates.email && updates.email !== oldUser.email) {
        await this.handleEmailChange(userId, updates.email, oldUser.email);
      }

      if (updates.phone && updates.phone !== oldUser.phone) {
        await this.handlePhoneChange(userId, updates.phone, oldUser.phone);
      }

      return updatedUser;

    } catch (error) {
      return this.handleError(error, 'updateUserProfile', userId);
    }
  }

  /**
   * Верификация учетных данных пользователя
   */
  async verifyUserCredentials(identifier: string, password: string): Promise<AuthResult> {
    if (!identifier || !password) {
      throw new ValidationError('Email/телефон и пароль обязательны');
    }

    try {
      // Находим пользователя по email или phone
      const user = await this.storage.getUserByIdentifier(identifier);
      if (!user) {
        throw new ValidationError('Неверный email/телефон или пароль');
      }

      // Проверяем пароль
      if (!user.passwordHash) {
        throw new ValidationError('Для этого пользователя не установлен пароль');
      }

      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        await this.auditLog('failed_login', user.id, { identifier });
        throw new ValidationError('Неверный email/телефон или пароль');
      }

      // Генерируем JWT токен
      const token = this.generateJWT(user);

      await this.auditLog('successful_login', user.id, { identifier });

      return {
        user,
        token
      };

    } catch (error) {
      return this.handleError(error, 'verifyUserCredentials');
    }
  }

  /**
   * Смена пароля пользователя
   */
  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    this.validateUserId(userId);

    if (!oldPassword || !newPassword) {
      throw new ValidationError('Старый и новый пароль обязательны');
    }

    if (newPassword.length < 8) {
      throw new ValidationError('Новый пароль должен содержать минимум 8 символов');
    }

    try {
      const user = await this.storage.getUser(userId);
      if (!user || !user.passwordHash) {
        throw new NotFoundError('Пользователь или пароль');
      }

      // Проверяем старый пароль
      const isValidOldPassword = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!isValidOldPassword) {
        throw new ValidationError('Неверный текущий пароль');
      }

      // Хэшируем новый пароль
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);

      // Обновляем пароль
      await this.storage.updateUser(userId, { passwordHash: hashedNewPassword });

      await this.auditLog('password_changed', userId);

    } catch (error) {
      return this.handleError(error, 'changePassword', userId);
    }
  }

  /**
   * Инициация процесса верификации пользователя
   */
  async initiateUserVerification(userId: string): Promise<VerificationProcess> {
    this.validateUserId(userId);

    try {
      const user = await this.storage.getUser(userId);
      if (!user) {
        throw new NotFoundError('Пользователь', userId);
      }

      if (user.isVerified) {
        throw new BusinessError('Пользователь уже верифицирован');
      }

      // Получаем типы документов для верификации
      const documentTypes = await this.storage.getDocumentTypes?.() || [];
      const requiredDocuments = documentTypes
        .filter(dt => dt.isActive !== false) // используем isActive вместо isRequired
        .map(dt => dt.name);

      const processId = `verify_${userId}_${Date.now()}`;

      const process: VerificationProcess = {
        processId,
        requiredDocuments,
        status: 'pending'
      };

      await this.auditLog('verification_initiated', userId, { processId });

      return process;

    } catch (error) {
      return this.handleError(error, 'initiateUserVerification', userId);
    }
  }

  /**
   * Завершение верификации пользователя
   */
  async completeUserVerification(userId: string, verificationData: any): Promise<VerificationResult> {
    this.validateUserId(userId);

    try {
      const user = await this.storage.getUser(userId);
      if (!user) {
        throw new NotFoundError('Пользователь', userId);
      }

      // Проверяем документы пользователя
      const userDocuments = await this.storage.getUserDocuments?.(userId) || [];
      const verifiedDocuments = userDocuments.filter(d => d.status === 'verified');

      let verificationLevel: 'basic' | 'standard' | 'enhanced' = 'basic';
      
      if (verifiedDocuments.length >= 2) {
        verificationLevel = 'standard';
      }
      if (verifiedDocuments.length >= 3) {
        verificationLevel = 'enhanced';
      }

      // Обновляем статус верификации  
      await this.storage.updateUser(userId, { 
        isVerified: true,
        verificationLevel2: verificationLevel === 'standard' || verificationLevel === 'enhanced',
        verificationLevel3: verificationLevel === 'enhanced'
      });

      // Инвалидируем кэш
      await this.clearCache(`user_profile:${userId}`);

      const result: VerificationResult = {
        success: true,
        verificationLevel,
        message: `Верификация завершена успешно. Уровень: ${verificationLevel}`
      };

      await this.auditLog('verification_completed', userId, result);

      return result;

    } catch (error) {
      return this.handleError(error, 'completeUserVerification', userId);
    }
  }

  // ===========================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ===========================================

  /**
   * Валидация обновлений профиля
   */
  private async validateProfileUpdates(updates: ProfileUpdates): Promise<void> {
    if (updates.email) {
      if (!this.validateEmail(updates.email)) {
        throw new ValidationError('Некорректный формат email адреса');
      }
      
      // Проверяем уникальность email
      const existingUser = await this.storage.getUserByEmail(updates.email);
      if (existingUser) {
        throw new ValidationError('Пользователь с таким email уже существует');
      }
    }

    if (updates.phone) {
      if (!this.validateRussianPhone(updates.phone)) {
        throw new ValidationError('Некорректный формат российского номера телефона');
      }
      
      // Проверяем уникальность телефона
      const existingUser = await this.storage.getUserByPhone(updates.phone);
      if (existingUser) {
        throw new ValidationError('Пользователь с таким телефоном уже существует');
      }
    }

    if (updates.firstName && (updates.firstName.length < 2 || updates.firstName.length > 50)) {
      throw new ValidationError('Имя должно содержать от 2 до 50 символов');
    }

    if (updates.lastName && (updates.lastName.length < 2 || updates.lastName.length > 50)) {
      throw new ValidationError('Фамилия должна содержать от 2 до 50 символов');
    }
  }

  /**
   * Генерация JWT токена
   */
  private generateJWT(user: User): string {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified
    };

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET не настроен');
    }

    return jwt.sign(payload, secret, { 
      expiresIn: '24h',
      issuer: 'fintrack-api'
    });
  }

  /**
   * Получение изменений для аудита
   */
  private getChanges(oldUser: User, updates: ProfileUpdates): Record<string, any> {
    const changes: Record<string, any> = {};
    
    Object.keys(updates).forEach(key => {
      const oldValue = (oldUser as any)[key];
      const newValue = (updates as any)[key];
      if (oldValue !== newValue) {
        changes[key] = { from: oldValue, to: newValue };
      }
    });
    
    return changes;
  }

  /**
   * Обработка смены email
   */
  private async handleEmailChange(userId: string, newEmail: string, oldEmail?: string | null): Promise<void> {
    // TODO: Отправка уведомлений на старый и новый email
    console.log(`Email changed for user ${userId}: ${oldEmail} -> ${newEmail}`);
  }

  /**
   * Обработка смены телефона
   */
  private async handlePhoneChange(userId: string, newPhone: string, oldPhone?: string | null): Promise<void> {
    // TODO: Отправка SMS уведомлений
    console.log(`Phone changed for user ${userId}: ${oldPhone} -> ${newPhone}`);
  }
}

// Экспортируем singleton instance
export const userService = new UserService();