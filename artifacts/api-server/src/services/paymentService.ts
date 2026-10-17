import { storage } from "../storage";

/**
 * Сервис для работы с российскими платежными системами
 * Заменяет Stripe для работы в России
 */

export interface PaymentCredentials {
  merchantId: string;
  secretKey: string;
  publicKey?: string;
  apiUrl: string;
}

export interface PaymentRequest {
  amount: number; // в рублях
  currency: string;
  description: string;
  orderId: string;
  customerEmail?: string;
  customerPhone?: string;
  returnUrl: string;
  metadata?: Record<string, string>;
}

export interface PaymentResponse {
  paymentId: string;
  paymentUrl: string;
  status: 'pending' | 'success' | 'failed';
  amount: number;
  currency: string;
}

export interface SubscriptionRequest {
  planId: string;
  customerId: string;
  amount: number;
  period: 'month' | 'year';
  description: string;
}

/**
 * Базовый класс для платежных провайдеров
 */
abstract class BasePaymentProvider {
  protected providerName: string;
  protected credentials: PaymentCredentials;

  constructor(providerName: string, credentials: PaymentCredentials) {
    this.providerName = providerName;
    this.credentials = credentials;
  }

  /**
   * Создание платежа
   */
  abstract createPayment(request: PaymentRequest): Promise<PaymentResponse>;

  /**
   * Проверка статуса платежа
   */
  abstract getPaymentStatus(paymentId: string): Promise<PaymentResponse>;

  /**
   * Создание подписки
   */
  abstract createSubscription(request: SubscriptionRequest): Promise<{
    subscriptionId: string;
    paymentUrl: string;
    status: string;
  }>;

  /**
   * Отмена подписки
   */
  abstract cancelSubscription(subscriptionId: string): Promise<boolean>;

  /**
   * Возврат платежа
   */
  abstract refundPayment(paymentId: string, amount?: number): Promise<{
    refundId: string;
    status: string;
    amount: number;
  }>;
}

/**
 * Интеграция с ЮKassa (Яндекс.Касса)
 */
class YookassaProvider extends BasePaymentProvider {
  constructor(credentials: PaymentCredentials) {
    super('yookassa', credentials);
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    const response = await fetch(`${this.credentials.apiUrl}/v3/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.credentials.merchantId}:${this.credentials.secretKey}`).toString('base64')}`,
        'Idempotence-Key': this.generateIdempotenceKey(),
      },
      body: JSON.stringify({
        amount: {
          value: request.amount.toFixed(2),
          currency: request.currency,
        },
        confirmation: {
          type: 'redirect',
          return_url: request.returnUrl,
        },
        description: request.description,
        metadata: {
          order_id: request.orderId,
          ...request.metadata,
        },
        receipt: request.customerEmail ? {
          customer: {
            email: request.customerEmail,
            phone: request.customerPhone,
          },
          items: [{
            description: request.description,
            quantity: '1',
            amount: {
              value: request.amount.toFixed(2),
              currency: request.currency,
            },
            vat_code: 1, // НДС не облагается
          }],
        } : undefined,
      }),
    });

    if (!response.ok) {
      const error = (await response.json()) as any;
      throw new Error(`Ошибка ЮKassa: ${error.description || response.statusText}`);
    }

    const data = (await response.json()) as any;
    return {
      paymentId: data.id,
      paymentUrl: data.confirmation.confirmation_url,
      status: this.mapStatus(data.status),
      amount: parseFloat(data.amount.value),
      currency: data.amount.currency,
    };
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentResponse> {
    const response = await fetch(`${this.credentials.apiUrl}/v3/payments/${paymentId}`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${this.credentials.merchantId}:${this.credentials.secretKey}`).toString('base64')}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Ошибка получения статуса ЮKassa: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    return {
      paymentId: data.id,
      paymentUrl: data.confirmation?.confirmation_url || '',
      status: this.mapStatus(data.status),
      amount: parseFloat(data.amount.value),
      currency: data.amount.currency,
    };
  }

  async createSubscription(request: SubscriptionRequest): Promise<{
    subscriptionId: string;
    paymentUrl: string;
    status: string;
  }> {
    // ЮKassa не поддерживает подписки напрямую, используем рекуррентные платежи
    const paymentResponse = await this.createPayment({
      amount: request.amount,
      currency: 'RUB',
      description: request.description,
      orderId: `subscription_${request.customerId}_${Date.now()}`,
      returnUrl: `${process.env.BASE_URL}/subscription/success`,
      metadata: {
        subscription: 'true',
        plan_id: request.planId,
        customer_id: request.customerId,
        period: request.period,
      },
    });

    return {
      subscriptionId: paymentResponse.paymentId,
      paymentUrl: paymentResponse.paymentUrl,
      status: paymentResponse.status,
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    // Для ЮKassa отмена подписки - это пометка в нашей системе
    // Реальные рекуррентные платежи нужно отменять через webhook
    return true;
  }

  async refundPayment(paymentId: string, amount?: number): Promise<{
    refundId: string;
    status: string;
    amount: number;
  }> {
    const payment = await this.getPaymentStatus(paymentId);
    const refundAmount = amount || payment.amount;

    const response = await fetch(`${this.credentials.apiUrl}/v3/refunds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.credentials.merchantId}:${this.credentials.secretKey}`).toString('base64')}`,
        'Idempotence-Key': this.generateIdempotenceKey(),
      },
      body: JSON.stringify({
        payment_id: paymentId,
        amount: {
          value: refundAmount.toFixed(2),
          currency: payment.currency,
        },
      }),
    });

    if (!response.ok) {
      const error = (await response.json()) as any;
      throw new Error(`Ошибка возврата ЮKassa: ${error.description || response.statusText}`);
    }

    const data = (await response.json()) as any;
    return {
      refundId: data.id,
      status: data.status,
      amount: parseFloat(data.amount.value),
    };
  }

  private mapStatus(status: string): 'pending' | 'success' | 'failed' {
    switch (status) {
      case 'pending': return 'pending';
      case 'waiting_for_capture': return 'pending';
      case 'succeeded': return 'success';
      case 'canceled': return 'failed';
      default: return 'pending';
    }
  }

  private generateIdempotenceKey(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Интеграция с CloudPayments
 */
class CloudPaymentsProvider extends BasePaymentProvider {
  constructor(credentials: PaymentCredentials) {
    super('cloudpayments', credentials);
  }

  async createPayment(request: PaymentRequest): Promise<PaymentResponse> {
    const response = await fetch(`${this.credentials.apiUrl}/payments/cards/topup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.credentials.publicKey}:${this.credentials.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        Amount: request.amount,
        Currency: request.currency,
        InvoiceId: request.orderId,
        Description: request.description,
        Email: request.customerEmail,
        RequireConfirmation: false,
        JsonData: request.metadata,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка CloudPayments: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    if (!data.Success) {
      throw new Error(`Ошибка CloudPayments: ${data.Message}`);
    }

    return {
      paymentId: data.Model.TransactionId.toString(),
      paymentUrl: data.Model.PaReq ? `${this.credentials.apiUrl}/3ds/start` : '',
      status: data.Model.Status === 'Completed' ? 'success' : 'pending',
      amount: data.Model.Amount,
      currency: data.Model.Currency,
    };
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentResponse> {
    const response = await fetch(`${this.credentials.apiUrl}/payments/get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.credentials.publicKey}:${this.credentials.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        TransactionId: parseInt(paymentId),
      }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка получения статуса CloudPayments: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    if (!data.Success) {
      throw new Error(`Ошибка CloudPayments: ${data.Message}`);
    }

    return {
      paymentId: data.Model.Id.toString(),
      paymentUrl: '',
      status: data.Model.Status === 'Completed' ? 'success' : 'failed',
      amount: data.Model.Amount,
      currency: data.Model.Currency,
    };
  }

  async createSubscription(request: SubscriptionRequest): Promise<{
    subscriptionId: string;
    paymentUrl: string;
    status: string;
  }> {
    const response = await fetch(`${this.credentials.apiUrl}/subscriptions/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.credentials.publicKey}:${this.credentials.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        Token: request.customerId, // Токен карты клиента
        AccountId: request.customerId,
        Description: request.description,
        Email: '', // Email клиента
        Amount: request.amount,
        Currency: 'RUB',
        Period: request.period === 'month' ? 1 : 12,
        Interval: request.period === 'month' ? 'Month' : 'Year',
        MaxPeriods: 0, // Без ограничений
      }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка создания подписки CloudPayments: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    if (!data.Success) {
      throw new Error(`Ошибка CloudPayments: ${data.Message}`);
    }

    return {
      subscriptionId: data.Model.Id.toString(),
      paymentUrl: '', // CloudPayments не требует redirect для подписок
      status: 'success',
    };
  }

  async cancelSubscription(subscriptionId: string): Promise<boolean> {
    const response = await fetch(`${this.credentials.apiUrl}/subscriptions/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.credentials.publicKey}:${this.credentials.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        Id: parseInt(subscriptionId),
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as any;
    return data.Success;
  }

  async refundPayment(paymentId: string, amount?: number): Promise<{
    refundId: string;
    status: string;
    amount: number;
  }> {
    const response = await fetch(`${this.credentials.apiUrl}/payments/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${this.credentials.publicKey}:${this.credentials.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({
        TransactionId: parseInt(paymentId),
        Amount: amount,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ошибка возврата CloudPayments: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    if (!data.Success) {
      throw new Error(`Ошибка CloudPayments: ${data.Message}`);
    }

    return {
      refundId: data.Model.Id.toString(),
      status: 'success',
      amount: data.Model.Amount,
    };
  }
}

/**
 * Главный сервис для работы с платежами
 */
export class PaymentService {
  private providers: Map<string, BasePaymentProvider> = new Map();
  private defaultProvider: string = 'yookassa';

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders() {
    // ЮKassa (рекомендуется для России)
    if (process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY) {
      const yookassa = new YookassaProvider({
        merchantId: process.env.YOOKASSA_SHOP_ID,
        secretKey: process.env.YOOKASSA_SECRET_KEY,
        apiUrl: 'https://api.yookassa.ru',
      });
      this.providers.set('yookassa', yookassa);
    }

    // CloudPayments
    if (process.env.CLOUDPAYMENTS_PUBLIC_ID && process.env.CLOUDPAYMENTS_SECRET_KEY) {
      const cloudpayments = new CloudPaymentsProvider({
        merchantId: process.env.CLOUDPAYMENTS_PUBLIC_ID,
        publicKey: process.env.CLOUDPAYMENTS_PUBLIC_ID,
        secretKey: process.env.CLOUDPAYMENTS_SECRET_KEY,
        apiUrl: 'https://api.cloudpayments.ru',
      });
      this.providers.set('cloudpayments', cloudpayments);
    }
  }

  /**
   * Создание платежа
   */
  async createPayment(request: PaymentRequest, providerName?: string): Promise<PaymentResponse> {
    const provider = this.getProvider(providerName);
    return provider.createPayment(request);
  }

  /**
   * Создание подписки
   */
  async createSubscription(request: SubscriptionRequest, providerName?: string): Promise<{
    subscriptionId: string;
    paymentUrl: string;
    status: string;
  }> {
    const provider = this.getProvider(providerName);
    return provider.createSubscription(request);
  }

  /**
   * Проверка статуса платежа
   */
  async getPaymentStatus(paymentId: string, providerName?: string): Promise<PaymentResponse> {
    const provider = this.getProvider(providerName);
    return provider.getPaymentStatus(paymentId);
  }

  /**
   * Возврат платежа
   */
  async refundPayment(paymentId: string, amount?: number, providerName?: string): Promise<{
    refundId: string;
    status: string;
    amount: number;
  }> {
    const provider = this.getProvider(providerName);
    return provider.refundPayment(paymentId, amount);
  }

  /**
   * Отмена подписки
   */
  async cancelSubscription(subscriptionId: string, providerName?: string): Promise<boolean> {
    const provider = this.getProvider(providerName);
    return provider.cancelSubscription(subscriptionId);
  }

  /**
   * Получение доступных провайдеров
   */
  getAvailableProviders(): Array<{ name: string; available: boolean }> {
    return [
      { name: 'yookassa', available: this.providers.has('yookassa') },
      { name: 'cloudpayments', available: this.providers.has('cloudpayments') },
    ];
  }

  private getProvider(providerName?: string): BasePaymentProvider {
    const name = providerName || this.defaultProvider;
    const provider = this.providers.get(name);
    
    if (!provider) {
      throw new Error(`Платежный провайдер ${name} не настроен`);
    }
    
    return provider;
  }
}

export const paymentService = new PaymentService();