import { storage } from "../storage";

/**
 * Отключение банковских подключений.
 *
 * Подключение и синхронизация идут через bankApiService (ПКС). Прежний демо-поток
 * (/banks/connect, /banks/oauth-callback) выдумывал токены и создавал в БД случайные
 * счета и операции, поэтому удалён.
 */
export class BankService {
  async disconnectBank(userId: string, bankConnectionId: string): Promise<void> {
    const existing = await storage.getBankConnection(bankConnectionId);
    if (!existing || existing.userId !== userId) {
      throw new Error('Подключение не найдено');
    }

    const connection = await storage.updateBankConnection(bankConnectionId, {
      status: 'revoked',
    });

    if (!connection) {
      throw new Error('Подключение не найдено');
    }

    // Deactivate associated accounts
    const accounts = await storage.getAccountsByBank(bankConnectionId);
    for (const account of accounts) {
      await storage.updateAccount(account.id, {
        isActive: false,
      });
    }
  }
}

export const bankService = new BankService();
