import { BaseService, ValidationError, BusinessError, NotFoundError } from "./BaseService";
import type { 
  IDocumentService,
  DocumentInfo,
  UploadDocumentData,
  VerificationStatus 
} from "./interfaces";
import type { Document, InsertDocument } from "@shared/schema";

/**
 * DocumentService - сервис для управления документами
 * Инкапсулирует всю бизнес-логику верификации и управления документами
 */
export class DocumentService extends BaseService implements IDocumentService {

  /**
   * Получение документов пользователя с дополнительной информацией
   */
  async getUserDocuments(userId: string, status?: string): Promise<DocumentInfo[]> {
    this.validateUserId(userId);

    try {
      // Проверяем кэш
      const cacheKey = `user_documents:${userId}:${status || 'all'}`;
      const cached = await this.getFromCache<DocumentInfo[]>(cacheKey);
      if (cached) {
        await this.auditLog('getUserDocuments_cached', userId);
        return cached;
      }

      // Получаем документы пользователя
      const documents = await this.storage.getUserDocuments(userId, status);
      
      // Обогащаем данными типов документов
      const documentTypes = await this.storage.getDocumentTypes?.() || [];
      const typeMap = new Map(documentTypes.map(type => [type.id, type]));

      // Формируем обогащенную информацию о документах
      const enrichedDocuments: DocumentInfo[] = await Promise.all(
        documents.map(async (doc) => {
          const documentType = typeMap.get(doc.documentTypeId);
          const verificationHistory = await this.storage.getDocumentVerificationHistory?.(doc.id) || [];

          return {
            ...doc,
            typeName: documentType?.displayName || doc.documentTypeId,
            isRequired: documentType?.isActive !== false,
            verificationHistory: verificationHistory.map(h => ({
              action: h.newStatus || 'unknown',
              performedBy: h.changedBy || 'system',
              performedAt: h.createdAt || new Date(),
              reason: h.changeReason || undefined
            }))
          };
        })
      );

      // Кэшируем на 2 минуты
      await this.setCache(cacheKey, enrichedDocuments, 120);

      await this.auditLog('getUserDocuments', userId, { status, count: enrichedDocuments.length });
      return enrichedDocuments;

    } catch (error) {
      return this.handleError(error, 'getUserDocuments', userId);
    }
  }

  /**
   * Загрузка нового документа
   */
  async uploadDocument(userId: string, documentData: UploadDocumentData): Promise<Document> {
    this.validateUserId(userId);

    try {
      // Валидируем данные документа
      await this.validateDocumentData(documentData);

      // Проверяем лимиты пользователя
      const userDocuments = await this.storage.getUserDocuments(userId);
      if (userDocuments.length >= 20) {
        throw new BusinessError('Превышен лимит документов (максимум 20)');
      }

      // Проверяем, не загружен ли уже документ этого типа
      const existingDoc = userDocuments.find(doc => 
        doc.documentTypeId === documentData.documentTypeId && 
        doc.status !== 'rejected'
      );
      
      if (existingDoc) {
        throw new BusinessError('Документ этого типа уже загружен');
      }

      // Создаем документ
      const document = await this.storage.createDocument({
        userId,
        documentTypeId: documentData.documentTypeId,
        fileName: documentData.fileName,
        filePath: `encrypted_${documentData.documentTypeId}_${Date.now()}`,
        fileSize: documentData.fileSize,
        mimeType: documentData.mimeType,
        checksum: this.calculateChecksum(documentData.encryptedContent),
        status: 'pending'
      });

      // Инвалидируем кэш документов пользователя
      await this.clearCache(`user_documents:${userId}`);

      await this.auditLog('document_uploaded', userId, {
        documentId: document.id,
        documentType: documentData.documentTypeId,
        fileName: documentData.fileName,
        fileSize: documentData.fileSize
      });

      return document;

    } catch (error) {
      return this.handleError(error, 'uploadDocument', userId);
    }
  }

  /**
   * Отправка документа на верификацию
   */
  async submitForVerification(documentId: string): Promise<void> {
    this.validateUUID(documentId, 'ID документа');

    try {
      const document = await this.storage.getDocument(documentId);
      if (!document) {
        throw new NotFoundError('Документ', documentId);
      }

      if (document.status !== 'pending') {
        throw new BusinessError('Документ уже отправлен на верификацию или обработан');
      }

      // Обновляем статус документа
      await this.storage.updateDocumentStatus(documentId, 'processing', null, 'Отправлен на верификацию');

      // Инвалидируем кэш
      await this.clearCache(`user_documents:${document.userId}`);

      await this.auditLog('document_submitted_for_verification', document.userId, {
        documentId
      });

    } catch (error) {
      return this.handleError(error, 'submitForVerification');
    }
  }

  /**
   * Получение статуса верификации документа
   */
  async getVerificationStatus(documentId: string): Promise<VerificationStatus> {
    this.validateUUID(documentId, 'ID документа');

    try {
      const document = await this.storage.getDocument(documentId);
      if (!document) {
        throw new NotFoundError('Документ', documentId);
      }

      // Получаем последнюю запись из истории верификации
      const history = await this.storage.getDocumentVerificationHistory?.(documentId) || [];
      const lastVerification = history[history.length - 1];

      const status: VerificationStatus = {
        status: document.status as any,
        verifiedAt: document.verifiedAt,
        verifiedBy: lastVerification?.changedBy || null,
        rejectionReason: lastVerification?.changeReason || null
      };

      return status;

    } catch (error) {
      return this.handleError(error, 'getVerificationStatus');
    }
  }

  /**
   * Получение документов ожидающих верификации (админ функция)
   */
  async getPendingDocuments(): Promise<DocumentInfo[]> {
    try {
      // Проверяем кэш
      const cacheKey = 'pending_documents';
      const cached = await this.getFromCache<DocumentInfo[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const pendingDocuments = await this.storage.getUserDocuments('', 'pending');
      
      // Обогащаем данными пользователей и типов
      const enrichedDocuments: DocumentInfo[] = await Promise.all(
        pendingDocuments.map(async (doc) => {
          const user = await this.storage.getUser(doc.userId);
          const documentTypes = await this.storage.getDocumentTypes?.() || [];
          const documentType = documentTypes.find(type => type.id === doc.documentTypeId);

          return {
            ...doc,
            typeName: documentType?.displayName || doc.documentTypeId,
            isRequired: documentType?.isActive !== false,
            verificationHistory: [],
            // Добавляем информацию о пользователе для админов
            userName: user ? `${user.firstName} ${user.lastName}` : 'Неизвестный пользователь'
          } as DocumentInfo & { userName: string };
        })
      );

      // Кэшируем на 1 минуту (часто обновляется)
      await this.setCache(cacheKey, enrichedDocuments, 60);

      return enrichedDocuments;

    } catch (error) {
      return this.handleError(error, 'getPendingDocuments');
    }
  }

  /**
   * Одобрение документа (админ функция)
   */
  async approveDocument(documentId: string, adminId: string): Promise<Document> {
    this.validateUUID(documentId, 'ID документа');
    this.validateUserId(adminId);

    try {
      const document = await this.storage.getDocument(documentId);
      if (!document) {
        throw new NotFoundError('Документ', documentId);
      }

      if (document.status === 'verified') {
        throw new BusinessError('Документ уже верифицирован');
      }

      // Обновляем статус документа
      const updatedDocument = await this.storage.updateDocumentStatus(
        documentId, 
        'verified', 
        adminId,
        'Документ одобрен администратором'
      );

      // Инвалидируем кэш
      await this.clearCache(`user_documents:${document.userId}`);
      await this.clearCache('pending_documents');

      await this.auditLog('document_approved', adminId, {
        documentId,
        userId: document.userId
      });

      return updatedDocument || document;

    } catch (error) {
      return this.handleError(error, 'approveDocument', adminId);
    }
  }

  /**
   * Отклонение документа (админ функция)
   */
  async rejectDocument(documentId: string, adminId: string, reason: string): Promise<Document> {
    this.validateUUID(documentId, 'ID документа');
    this.validateUserId(adminId);

    try {
      const document = await this.storage.getDocument(documentId);
      if (!document) {
        throw new NotFoundError('Документ', documentId);
      }

      if (document.status === 'rejected') {
        throw new BusinessError('Документ уже отклонен');
      }

      if (!reason || reason.trim().length === 0) {
        throw new ValidationError('Причина отклонения обязательна');
      }

      // Обновляем статус документа
      const updatedDocument = await this.storage.updateDocumentStatus(
        documentId,
        'rejected',
        adminId,
        reason
      );

      // Инвалидируем кэш
      await this.clearCache(`user_documents:${document.userId}`);
      await this.clearCache('pending_documents');

      await this.auditLog('document_rejected', adminId, {
        documentId,
        userId: document.userId,
        reason
      });

      return updatedDocument || document;

    } catch (error) {
      return this.handleError(error, 'rejectDocument', adminId);
    }
  }

  // ===========================================
  // ПРИВАТНЫЕ МЕТОДЫ
  // ===========================================

  /**
   * Валидация данных документа
   */
  private async validateDocumentData(data: UploadDocumentData): Promise<void> {
    if (!data.documentTypeId) {
      throw new ValidationError('Тип документа обязателен');
    }

    if (!data.fileName || data.fileName.trim().length === 0) {
      throw new ValidationError('Имя файла обязательно');
    }

    if (data.fileSize <= 0) {
      throw new ValidationError('Размер файла должен быть больше 0');
    }

    if (data.fileSize > 50 * 1024 * 1024) { // 50MB
      throw new ValidationError('Максимальный размер файла 50MB');
    }

    if (!data.mimeType) {
      throw new ValidationError('MIME тип файла обязателен');
    }

    // Проверяем допустимые типы файлов
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf'
    ];

    if (!allowedTypes.includes(data.mimeType)) {
      throw new ValidationError('Неподдерживаемый тип файла');
    }

    // Проверяем существование типа документа
    const documentTypes = await this.storage.getDocumentTypes?.() || [];
    const documentType = documentTypes.find(type => type.id === data.documentTypeId);
    
    if (!documentType) {
      throw new ValidationError('Неизвестный тип документа');
    }

    if (documentType.isActive === false) {
      throw new ValidationError('Этот тип документа больше не принимается');
    }
  }

  /**
   * Расчет контрольной суммы файла
   */
  private calculateChecksum(content: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

// Экспортируем singleton instance
export const documentService = new DocumentService();