import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { storage } from "../storage";
import type { User } from "@shared/schema";

export interface TwoFactorSetupResponse {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
  manualEntryKey: string;
}

export interface SMSCodeResponse {
  success: boolean;
  expiresAt: Date;
}

export class TwoFactorService {
  private readonly APP_NAME = "FinTrack";
  private readonly SMS_CODE_EXPIRY_MINUTES = 5;

  /**
   * Генерирует секретный ключ и QR-код для настройки TOTP аутентификатора
   */
  async generateTOTPSetup(userId: string): Promise<TwoFactorSetupResponse> {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error("Пользователь не найден");
    }

    // Генерируем секретный ключ
    const secret = speakeasy.generateSecret({
      name: `${this.APP_NAME}:${user.firstName} ${user.lastName} (${user.phone})`,
      issuer: this.APP_NAME,
      length: 32,
    });

    // Генерируем резервные коды
    const backupCodes = this.generateBackupCodes();

    // Создаем QR-код
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
      manualEntryKey: secret.base32,
    };
  }

  /**
   * Включает 2FA после подтверждения кода
   */
  async enableTwoFactor(
    userId: string,
    secret: string,
    verificationCode: string,
    backupCodes: string[]
  ): Promise<boolean> {
    // Проверяем код
    const isValid = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token: verificationCode,
      window: 2, // Разрешаем небольшое отклонение времени
    });

    if (!isValid) {
      throw new Error("Неверный код подтверждения");
    }

    // Сохраняем настройки 2FA
    await storage.updateUser(userId, {
      twoFactorEnabled: true,
      twoFactorSecret: secret,
      twoFactorBackupCodes: backupCodes,
    });

    return true;
  }

  /**
   * Отключает 2FA
   */
  async disableTwoFactor(userId: string, verificationCode: string): Promise<boolean> {
    const user = await storage.getUser(userId);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new Error("2FA не включена");
    }

    // Проверяем код (может быть TOTP или резервный код)
    const isTOTPValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: verificationCode,
      window: 2,
    });

    const isBackupCodeValid = 
      user.twoFactorBackupCodes?.includes(verificationCode) || false;

    if (!isTOTPValid && !isBackupCodeValid) {
      throw new Error("Неверный код подтверждения");
    }

    // Если использовался резервный код, удаляем его
    if (isBackupCodeValid && user.twoFactorBackupCodes) {
      const updatedBackupCodes = user.twoFactorBackupCodes.filter(
        (code) => code !== verificationCode
      );

      await storage.updateUser(userId, {
        twoFactorBackupCodes: updatedBackupCodes,
      });
    }

    // Отключаем 2FA
    await storage.updateUser(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorBackupCodes: null,
    });

    return true;
  }

  /**
   * Проверяет 2FA код при входе
   */
  async verifyTwoFactor(userId: string, code: string): Promise<boolean> {
    const user = await storage.getUser(userId);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      return true; // 2FA не включена
    }

    // Проверяем TOTP код
    const isTOTPValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: code,
      window: 2,
    });

    if (isTOTPValid) {
      return true;
    }

    // Проверяем резервный код
    const isBackupCodeValid = 
      user.twoFactorBackupCodes?.includes(code) || false;

    if (isBackupCodeValid && user.twoFactorBackupCodes) {
      // Удаляем использованный резервный код
      const updatedBackupCodes = user.twoFactorBackupCodes.filter(
        (backupCode) => backupCode !== code
      );

      await storage.updateUser(userId, {
        twoFactorBackupCodes: updatedBackupCodes,
      });

      return true;
    }

    return false;
  }

  /**
   * Отправляет SMS с кодом (заглушка для разработки)
   */
  async sendSMSCode(phone: string): Promise<SMSCodeResponse> {
    // Генерируем 6-значный код
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + this.SMS_CODE_EXPIRY_MINUTES * 60 * 1000);

    // В продакшене здесь будет интеграция с SMS-провайдером (SMS.RU, SMSC.RU, etc.)
    console.log(`📱 SMS код для ${phone}: ${code}`);

    // Находим пользователя и сохраняем код
    const user = await storage.getUserByPhone(phone);
    if (user) {
      await storage.updateUser(user.id, {
        smsCode: code,
        smsCodeExpiry: expiresAt,
      });
    }

    return {
      success: true,
      expiresAt,
    };
  }

  /**
   * Проверяет SMS код
   */
  async verifySMSCode(phone: string, code: string): Promise<boolean> {
    const user = await storage.getUserByPhone(phone);
    if (!user || !user.smsCode || !user.smsCodeExpiry) {
      return false;
    }

    // Проверяем срок действия
    if (new Date() > user.smsCodeExpiry) {
      // Очищаем истекший код
      await storage.updateUser(user.id, {
        smsCode: null,
        smsCodeExpiry: null,
      });
      return false;
    }

    // Проверяем код
    if (user.smsCode === code) {
      // Очищаем использованный код
      await storage.updateUser(user.id, {
        smsCode: null,
        smsCodeExpiry: null,
      });
      return true;
    }

    return false;
  }

  /**
   * Генерирует резервные коды
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      // Генерируем 8-значные коды
      const code = Math.floor(10000000 + Math.random() * 90000000).toString();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Проверяет необходимость 2FA для пользователя
   */
  async requiresTwoFactor(userId: string): Promise<boolean> {
    const user = await storage.getUser(userId);
    return user?.twoFactorEnabled || false;
  }

  /**
   * Получает новые резервные коды
   */
  async regenerateBackupCodes(userId: string, verificationCode: string): Promise<string[]> {
    const user = await storage.getUser(userId);
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new Error("2FA не включена");
    }

    // Проверяем код
    const isValid = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token: verificationCode,
      window: 2,
    });

    if (!isValid) {
      throw new Error("Неверный код подтверждения");
    }

    // Генерируем новые резервные коды
    const newBackupCodes = this.generateBackupCodes();

    await storage.updateUser(userId, {
      twoFactorBackupCodes: newBackupCodes,
    });

    return newBackupCodes;
  }
}

export const twoFactorService = new TwoFactorService();