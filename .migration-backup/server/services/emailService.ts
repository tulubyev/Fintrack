import nodemailer from 'nodemailer';

export interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface EmailResponse {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    if (!process.env.BEGET_SMTP_HOST || !process.env.BEGET_SMTP_USER || !process.env.BEGET_SMTP_PASSWORD) {
      throw new Error('Beget SMTP environment variables are required');
    }

    this.transporter = nodemailer.createTransport({
      host: process.env.BEGET_SMTP_HOST,
      port: parseInt(process.env.BEGET_SMTP_PORT || '587'),
      secure: process.env.BEGET_SMTP_PORT === '465', // true for 465, false for other ports
      auth: {
        user: process.env.BEGET_SMTP_USER,
        pass: process.env.BEGET_SMTP_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false // для некоторых SMTP серверов
      }
    });
  }

  async sendEmail(options: EmailOptions): Promise<EmailResponse> {
    try {
      const mailOptions = {
        from: `"FinTrack" <${process.env.BEGET_SMTP_USER}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html || options.text,
      };

      const info = await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      console.error('Email Service Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  async sendVerificationEmail(email: string, verificationCode: string): Promise<EmailResponse> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Подтверждение email - FinTrack</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #007bff, #0056b3); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .code { background: #f8f9fa; border: 2px dashed #007bff; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0; }
          .code-text { font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 5px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 FinTrack</h1>
            <p>Подтверждение email адреса</p>
          </div>
          <div class="content">
            <h2>Добро пожаловать в FinTrack!</h2>
            <p>Для завершения регистрации введите код подтверждения:</p>
            
            <div class="code">
              <div class="code-text">${verificationCode}</div>
            </div>
            
            <p><strong>Важно:</strong></p>
            <ul>
              <li>Код действителен в течение 10 минут</li>
              <li>Не сообщайте код третьим лицам</li>
              <li>Если вы не регистрировались на FinTrack, проигнорируйте это письмо</li>
            </ul>
            
            <p>С уважением,<br>Команда FinTrack</p>
          </div>
          <div class="footer">
            <p>Это автоматическое письмо. Не отвечайте на него.</p>
            <p>© 2024 FinTrack. Финансовый агрегатор для России.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: 'Подтверждение email - FinTrack',
      html: html
    });
  }

  async sendWelcomeEmail(email: string, firstName: string): Promise<EmailResponse> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Добро пожаловать в FinTrack</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #28a745, #20c997); color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .features { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Добро пожаловать, ${firstName}!</h1>
            <p>Ваш аккаунт FinTrack успешно создан</p>
          </div>
          <div class="content">
            <h2>Что дальше?</h2>
            
            <div class="features">
              <h3>📱 Возможности FinTrack:</h3>
              <ul>
                <li><strong>Банковские счета</strong> - подключите все свои карты и счета</li>
                <li><strong>Бюджетирование</strong> - планируйте расходы и доходы</li>
                <li><strong>Аналитика</strong> - отслеживайте финансовые цели</li>
                <li><strong>ИИ-помощник</strong> - получайте персональные советы</li>
              </ul>
            </div>
            
            <h3>🔒 Повысьте уровень верификации:</h3>
            <p>Для доступа ко всем возможностям пройдите дополнительную верификацию:</p>
            <ul>
              <li>Загрузите документы для увеличения лимитов</li>
              <li>Подключите Госуслуги для мгновенной верификации</li>
              <li>Подтвердите банковскую карту</li>
            </ul>
            
            <p>Начните с подключения первого банковского счета!</p>
          </div>
          <div class="footer">
            <p>© 2024 FinTrack. Ваш надежный финансовый помощник.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `Добро пожаловать в FinTrack, ${firstName}!`,
      html: html
    });
  }

  async sendVerificationStatusEmail(
    email: string, 
    firstName: string, 
    status: 'approved' | 'rejected' | 'pending',
    level: number,
    reason?: string
  ): Promise<EmailResponse> {
    const statusInfo = {
      approved: {
        title: '✅ Верификация одобрена',
        color: '#28a745',
        message: `Поздравляем! Ваша верификация уровня ${level} успешно пройдена.`
      },
      rejected: {
        title: '❌ Верификация отклонена', 
        color: '#dc3545',
        message: `К сожалению, ваша заявка на верификацию уровня ${level} отклонена.`
      },
      pending: {
        title: '⏳ Верификация на рассмотрении',
        color: '#ffc107',
        message: `Ваша заявка на верификацию уровня ${level} принята в обработку.`
      }
    };

    const info = statusInfo[status];

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${info.title} - FinTrack</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .header { background: ${info.color}; color: white; padding: 30px; text-align: center; }
          .content { padding: 30px; }
          .status { background: #f8f9fa; padding: 20px; border-left: 4px solid ${info.color}; margin: 20px 0; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${info.title}</h1>
            <p>Уровень верификации ${level}</p>
          </div>
          <div class="content">
            <h2>Здравствуйте, ${firstName}!</h2>
            
            <div class="status">
              <p><strong>${info.message}</strong></p>
              ${reason ? `<p><strong>Комментарий:</strong> ${reason}</p>` : ''}
            </div>
            
            ${status === 'approved' ? `
              <h3>Ваши новые возможности:</h3>
              <ul>
                <li>Увеличены лимиты операций</li>
                <li>Доступ к расширенной аналитике</li>
                <li>Приоритетная поддержка</li>
              </ul>
            ` : ''}
            
            ${status === 'rejected' ? `
              <p>Вы можете подать новую заявку на верификацию, исправив указанные замечания.</p>
            ` : ''}
            
            <p>Войдите в личный кабинет для подробной информации.</p>
          </div>
          <div class="footer">
            <p>© 2024 FinTrack. Надежные финансовые решения.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    return this.sendEmail({
      to: email,
      subject: `${info.title} - FinTrack`,
      html: html
    });
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.transporter.verify();
      return { success: true };
    } catch (error) {
      console.error('Email connection test failed:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }
}

export const emailService = new EmailService();