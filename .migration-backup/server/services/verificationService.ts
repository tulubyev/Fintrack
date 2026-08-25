import { smsService } from './smsService';
import { emailService } from './emailService';
import { storage } from '../storage';

export interface VerificationResult {
  success: boolean;
  message?: string;
  code?: string;
  expiresAt?: Date;
}

export class VerificationService {
  // In-memory storage for verification codes (for MVP testing)
  private static codes: Map<string, {
    code: string;
    type: 'sms' | 'email';
    target: string;
    attempts: number;
    expiresAt: Date;
    isUsed: boolean;
  }> = new Map();

  // Generate verification code (4-6 digits)
  private generateCode(length: number = 6): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  }

  // Clean up expired codes
  private cleanupExpiredCodes(): void {
    const now = new Date();
    const entries = Array.from(VerificationService.codes.entries());
    for (const [key, data] of entries) {
      if (data.expiresAt < now) {
        VerificationService.codes.delete(key);
      }
    }
  }

  // Generate unique key for code storage
  private getCodeKey(userId: string, type: 'sms' | 'email', target: string): string {
    return `${userId}-${type}-${target}`;
  }

  // Send SMS verification code
  async sendSMSCode(userId: string, phone: string): Promise<VerificationResult> {
    try {
      this.cleanupExpiredCodes();
      
      const codeKey = this.getCodeKey(userId, 'sms', phone);
      const existing = VerificationService.codes.get(codeKey);
      
      // Rate limiting: 1 minute between sends
      if (existing && (Date.now() - (existing.expiresAt.getTime() - 5 * 60 * 1000)) < 60000) {
        return {
          success: false,
          message: 'Код уже отправлен. Подождите 1 минуту перед повторной отправкой.'
        };
      }

      // Generate new code
      const code = this.generateCode(6);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Send SMS
      const smsResult = await smsService.sendVerificationCode(phone, code);
      
      if (!smsResult.success) {
        return {
          success: false,
          message: smsResult.message || 'Ошибка отправки SMS'
        };
      }

      // Store code
      VerificationService.codes.set(codeKey, {
        code,
        type: 'sms',
        target: phone,
        attempts: 0,
        expiresAt,
        isUsed: false
      });

      return {
        success: true,
        message: 'SMS код отправлен',
        expiresAt
      };

    } catch (error) {
      console.error('SMS verification error:', error);
      return {
        success: false,
        message: 'Ошибка отправки SMS кода'
      };
    }
  }

  // Send email verification code  
  async sendEmailCode(userId: string, email: string): Promise<VerificationResult> {
    try {
      this.cleanupExpiredCodes();
      
      const codeKey = this.getCodeKey(userId, 'email', email);
      const existing = VerificationService.codes.get(codeKey);
      
      // Rate limiting: 1 minute between sends
      if (existing && (Date.now() - (existing.expiresAt.getTime() - 10 * 60 * 1000)) < 60000) {
        return {
          success: false,
          message: 'Код уже отправлен. Подождите 1 минуту перед повторной отправкой.'
        };
      }

      // Generate new code
      const code = this.generateCode(6);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Send email
      const emailResult = await emailService.sendVerificationEmail(email, code);
      
      if (!emailResult.success) {
        return {
          success: false,
          message: emailResult.error || 'Ошибка отправки email'
        };
      }

      // Store code
      VerificationService.codes.set(codeKey, {
        code,
        type: 'email',
        target: email,
        attempts: 0,
        expiresAt,
        isUsed: false
      });

      return {
        success: true,
        message: 'Email код отправлен',
        expiresAt
      };

    } catch (error) {
      console.error('Email verification error:', error);
      return {
        success: false,
        message: 'Ошибка отправки email кода'
      };
    }
  }

  // Verify SMS code
  async verifySMSCode(userId: string, phone: string, inputCode: string): Promise<VerificationResult> {
    try {
      this.cleanupExpiredCodes();
      
      const codeKey = this.getCodeKey(userId, 'sms', phone);
      const stored = VerificationService.codes.get(codeKey);

      if (!stored) {
        return {
          success: false,
          message: 'Код не найден или истек срок действия'
        };
      }

      if (stored.isUsed) {
        return {
          success: false,
          message: 'Код уже был использован'
        };
      }

      // Check attempts
      if (stored.attempts >= 3) {
        VerificationService.codes.delete(codeKey);
        return {
          success: false,
          message: 'Превышено количество попыток. Запросите новый код.'
        };
      }

      // Verify code
      if (stored.code !== inputCode) {
        stored.attempts++;
        return {
          success: false,
          message: `Неверный код. Осталось попыток: ${3 - stored.attempts}`
        };
      }

      // Mark as used
      stored.isUsed = true;

      // Update user's phone verification status in database
      await storage.updateUser(userId, {
        isPhoneVerified: true
      });

      return {
        success: true,
        message: 'Телефон успешно подтвержден'
      };

    } catch (error) {
      console.error('SMS verification error:', error);
      return {
        success: false,
        message: 'Ошибка проверки SMS кода'
      };
    }
  }

  // Verify email code
  async verifyEmailCode(userId: string, email: string, inputCode: string): Promise<VerificationResult> {
    try {
      this.cleanupExpiredCodes();
      
      const codeKey = this.getCodeKey(userId, 'email', email);
      const stored = VerificationService.codes.get(codeKey);

      if (!stored) {
        return {
          success: false,
          message: 'Код не найден или истек срок действия'
        };
      }

      if (stored.isUsed) {
        return {
          success: false,
          message: 'Код уже был использован'
        };
      }

      // Check attempts
      if (stored.attempts >= 3) {
        VerificationService.codes.delete(codeKey);
        return {
          success: false,
          message: 'Превышено количество попыток. Запросите новый код.'
        };
      }

      // Verify code
      if (stored.code !== inputCode) {
        stored.attempts++;
        return {
          success: false,
          message: `Неверный код. Осталось попыток: ${3 - stored.attempts}`
        };
      }

      // Mark as used
      stored.isUsed = true;

      // Update user's email verification status in database
      await storage.updateUser(userId, {
        isEmailVerified: true
      });

      return {
        success: true,
        message: 'Email успешно подтвержден'
      };

    } catch (error) {
      console.error('Email verification error:', error);
      return {
        success: false,
        message: 'Ошибка проверки email кода'
      };
    }
  }

  // Test SMS service
  async testSMSService(): Promise<{ success: boolean; balance?: number; error?: string }> {
    try {
      const result = await smsService.checkBalance();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Test Email service
  async testEmailService(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await emailService.testConnection();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export const verificationService = new VerificationService();