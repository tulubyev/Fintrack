import fetch from 'node-fetch';

export interface SMSResponse {
  success: boolean;
  message?: string;
  balance?: number;
  cost?: number;
}

export class SMSService {
  private apiKey: string;
  private baseUrl = 'https://sms.ru/sms';

  constructor() {
    this.apiKey = process.env.SMS_RU_API_KEY!;
    if (!this.apiKey) {
      throw new Error('SMS_RU_API_KEY environment variable is required');
    }
  }

  async sendSMS(phone: string, message: string): Promise<SMSResponse> {
    try {
      // Форматируем номер для SMS.RU (убираем +7, оставляем 10 цифр)
      const formattedPhone = this.formatPhoneNumber(phone);
      
      const params = new URLSearchParams({
        api_id: this.apiKey,
        to: formattedPhone,
        msg: message,
        json: '1'
      });

      const response = await fetch(`${this.baseUrl}/send?${params}`, {
        method: 'GET',
        headers: {
          'User-Agent': 'FinTrack/1.0'
        }
      });

      const data = await response.json() as any;

      if (data.status === 'OK') {
        return {
          success: true,
          balance: data.balance,
          cost: Object.values(data.sms)[0] as number
        };
      } else {
        console.error('SMS.RU Error:', data);
        return {
          success: false,
          message: this.getErrorMessage(data.status_code || data.status)
        };
      }
    } catch (error) {
      console.error('SMS Service Error:', error);
      return {
        success: false,
        message: 'Ошибка отправки SMS'
      };
    }
  }

  async sendVerificationCode(phone: string, code: string): Promise<SMSResponse> {
    const message = `FinTrack: Код подтверждения ${code}. Не сообщайте его никому!`;
    return this.sendSMS(phone, message);
  }

  async checkBalance(): Promise<{ success: boolean; balance?: number }> {
    try {
      const params = new URLSearchParams({
        api_id: this.apiKey,
        json: '1'
      });

      const response = await fetch(`https://sms.ru/my/balance?${params}`);
      const data = await response.json() as any;

      if (data.status === 'OK') {
        return {
          success: true,
          balance: data.balance
        };
      }

      return { success: false };
    } catch (error) {
      console.error('Balance check error:', error);
      return { success: false };
    }
  }

  private formatPhoneNumber(phone: string): string {
    // Удаляем все нечисловые символы
    const digits = phone.replace(/[^\d]/g, '');
    
    // Если номер начинается с 8, заменяем на 7
    if (digits.startsWith('8') && digits.length === 11) {
      return '7' + digits.slice(1);
    }
    
    // Если номер начинается с 7 и длина 11 цифр
    if (digits.startsWith('7') && digits.length === 11) {
      return digits;
    }
    
    // Если 10 цифр, добавляем 7 в начало
    if (digits.length === 10) {
      return '7' + digits;
    }
    
    return digits;
  }

  private getErrorMessage(statusCode: string | number): string {
    const errorMessages: { [key: string]: string } = {
      '100': 'Неправильный api_id',
      '101': 'Не хватает средств на лицевом счету',
      '102': 'Неправильно указан получатель',
      '103': 'Нет текста сообщения',
      '104': 'Имя отправителя не согласовано с администрацией',
      '105': 'Сообщение слишком длинное',
      '106': 'Будет превышен или уже превышен дневной лимит',
      '107': 'На этот номер нельзя отправлять сообщения',
      '108': 'Параметр time указан неправильно',
      '109': 'Вы добавили этот номер в стоп-лист',
      '110': 'Используется GET, где необходимо использовать POST',
      '111': 'Метод не найден',
      '112': 'Текст сообщения необходимо передать в кодировке UTF-8'
    };

    return errorMessages[String(statusCode)] || `Неизвестная ошибка (${statusCode})`;
  }
}

export const smsService = new SMSService();