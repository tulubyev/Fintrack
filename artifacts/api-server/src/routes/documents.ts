import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticateToken } from '../middleware/auth.js';
import { requirePermission } from '../middleware/adminAuth.js';
import { storage } from '../storage';
import { documentStorageService } from '../services/documentStorageService.js';
import { documentService } from '../services/DocumentService.js';
import { config } from '../../config/environment';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { viewTokenService } from '../services/viewTokenService.js';

const router = Router();

// Configure multer for document uploads (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.uploads.maxFileSize,
  },
  fileFilter: (req, file, cb) => {
    // Accept images and PDFs only
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Недопустимый тип файла. Разрешены только изображения и PDF'));
    }
  }
});

/**
 * DOCUMENTS ROUTES MODULE
 * Extracted from main routes.ts for modular architecture
 * 
 * Routes:
 * - GET /types - Get document types
 * - GET / - Get user documents  
 * - PUT /:id/status - Update document status
 * - GET /:id/history - Get document history
 * - POST /upload - Upload document
 * - GET /:documentId/download - Download document
 * - GET /:documentId/view - View document in browser
 * - DELETE /:documentId - Delete document
 */

// Get document types
router.get('/types', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const documentTypes = await storage.getDocumentTypes();
    res.json(documentTypes);
  } catch (error) {
    console.error('Error fetching document types:', error);
    res.status(500).json({ message: 'Ошибка получения типов документов' });
  }
});

// Get user documents
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const status = req.query.status as string;
    const documents = await documentService.getUserDocuments(userId, status);
    res.json(documents);
  } catch (error) {
    console.error('Error fetching user documents:', error);
    res.status(500).json({ message: 'Ошибка получения документов' });
  }
});

// Update document status (модерация: только администратор с правом documents.verify)
router.put('/:id/status', authenticateToken, requirePermission('documents.verify'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, changeReason, verificationNotes, extractedData } = req.body;
    const userId = req.user!.id;

    // Validate status
    const validStatuses = ['pending', 'processing', 'verified', 'rejected', 'expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Неверный статус документа' });
    }

    const updatedDocument = await storage.updateDocumentStatus(
      id,
      status,
      userId,
      changeReason,
      verificationNotes,
      extractedData
    );

    if (!updatedDocument) {
      return res.status(404).json({ message: 'Документ не найден' });
    }

    res.json(updatedDocument);
  } catch (error) {
    console.error('Error updating document status:', error);
    res.status(500).json({ message: 'Ошибка обновления статуса документа' });
  }
});

// Get document history
router.get('/:id/history', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const document = await storage.getDocument(id);
    if (!document || (document.userId !== req.user!.id && !req.user!.adminRole)) {
      return res.status(404).json({ message: 'Документ не найден' });
    }
    const history = await storage.getDocumentVerificationHistory(id);
    res.json(history);
  } catch (error) {
    console.error('Error fetching document history:', error);
    res.status(500).json({ message: 'Ошибка получения истории документа' });
  }
});

// Upload document (local storage)
router.post('/upload', 
  authenticateToken, 
  upload.single('document'), 
  async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Файл не загружен' });
    }

    const userId = req.user!.id;
    const { documentTypeId, description } = req.body;

    // Валидируем обязательные поля
    if (!documentTypeId) {
      return res.status(400).json({ message: 'Тип документа обязателен для загрузки' });
    }

    // Сохраняем документ в зашифрованном виде
    const documentInfo = await documentStorageService.storeDocument(
      userId,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    // Сохраняем метаданные в базе данных
    const document = await storage.createDocument({
      userId,
      documentTypeId,
      fileName: req.file.originalname,
      filePath: documentInfo.encryptedPath,
      fileSize: documentInfo.size,
      mimeType: req.file.mimetype,
      // description field removed - not in schema
      checksum: documentInfo.checksum
    });

    res.json({ 
      document,
      message: 'Документ успешно загружен и зашифрован'
    });
  } catch (error) {
    console.error('Document upload error:', error);
    res.status(500).json({ 
      message: error instanceof Error ? error.message : 'Ошибка загрузки документа' 
    });
  }
});

// Download document from local encrypted storage
router.get('/:documentId/download', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { documentId } = req.params;

    // Получаем метаданные документа из базы данных
    const document = await storage.getDocument(documentId);
    
    if (!document) {
      return res.status(404).json({ message: 'Документ не найден' });
    }

    // Проверяем права доступа (пользователь может скачивать только свои документы, либо админ)
    const isAdmin = req.user!.adminRole && ['super_admin', 'security_admin'].includes(req.user!.adminRole);
    if (document.userId !== userId && !isAdmin) {
      return res.status(403).json({ message: 'Нет доступа к документу' });
    }

    // Получаем и расшифровываем файл (используем userId владельца документа для расшифровки)
    const ownerUserId = isAdmin ? document.userId : userId;
    const documentData = await documentStorageService.retrieveDocument(ownerUserId, document.filePath!);
    
    if (!documentData) {
      return res.status(404).json({ message: 'Файл документа не найден' });
    }

    // Проверяем целостность файла (используем userId владельца документа)
    const isValid = await documentStorageService.verifyDocument(
      ownerUserId, 
      document.filePath!, 
      document.checksum!
    );

    if (!isValid) {
      console.warn(`Document integrity check failed: owner=${ownerUserId}, document=${documentId}`);
      return res.status(500).json({ message: 'Файл поврежден' });
    }

    // Отправляем файл пользователю
    res.set({
      'Content-Type': document.mimeType,
      'Content-Length': documentData.buffer.length.toString(),
      'Content-Disposition': `inline; filename="${encodeURIComponent(document.fileName)}"`,
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff'
    });

    res.send(documentData.buffer);

  } catch (error) {
    console.error('Document download error:', error);
    res.status(500).json({ message: 'Ошибка загрузки документа' });
  }
});

// Generate one-time view token for a document (SECURITY FIX - no token in URL)
router.post('/:documentId/view-token', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { documentId } = req.params;

    // Verify document exists and user has access
    const document = await storage.getDocument(documentId);
    
    if (!document) {
      return res.status(404).json({ message: 'Документ не найден' });
    }

    const isAdmin = req.user!.adminRole && ['super_admin', 'security_admin'].includes(req.user!.adminRole);
    if (document.userId !== userId && !isAdmin) {
      return res.status(403).json({ message: 'Нет доступа к документу' });
    }

    // Generate one-time view token (expires in 1 minute)
    // Pass both requester userId and document owner userId
    const viewToken = viewTokenService.generateViewToken(documentId, userId, document.userId);
    
    res.json({ viewToken, expiresIn: 60 });
  } catch (error) {
    console.error('View token generation error:', error);
    res.status(500).json({ message: 'Ошибка генерации токена просмотра' });
  }
});

// View documents in browser using one-time view token (SECURITY FIX)
router.get('/:documentId/view', async (req: Request, res: Response) => {
  try {
    const { documentId } = req.params;
    const viewToken = req.query.viewToken as string;

    if (!viewToken) {
      return res.status(401).json({ message: 'View token требуется для просмотра документа' });
    }

    // Validate and consume one-time token
    const tokenData = viewTokenService.validateAndConsumeToken(viewToken);
    
    if (!tokenData) {
      return res.status(401).json({ message: 'Недействительный или истекший view token' });
    }

    if (tokenData.documentId !== documentId) {
      return res.status(403).json({ message: 'Token не соответствует документу' });
    }

    // Use ownerUserId from token for decryption (fixes admin viewing user documents)
    const ownerUserId = tokenData.ownerUserId;
    const requesterId = tokenData.userId;

    // Получаем метаданные документа из базы данных
    const document = await storage.getDocument(documentId);
    
    if (!document) {
      return res.status(404).json({ message: 'Документ не найден' });
    }

    // Verify ownerUserId matches document owner (additional safety check)
    if (document.userId !== ownerUserId) {
      return res.status(403).json({ message: 'Несоответствие владельца документа' });
    }
    const documentData = await documentStorageService.retrieveDocument(ownerUserId, document.filePath!);
    
    if (!documentData) {
      return res.status(404).json({ message: 'Файл документа не найден' });
    }

    // Проверяем целостность файла (используем userId владельца документа)
    const isValid = await documentStorageService.verifyDocument(
      ownerUserId, 
      document.filePath!, 
      document.checksum!
    );

    if (!isValid) {
      console.warn(`Document integrity check failed: owner=${ownerUserId}, document=${documentId}`);
      return res.status(500).json({ message: 'Файл поврежден' });
    }

    // Отправляем файл для просмотра в браузере
    res.set({
      'Content-Type': document.mimeType,
      'Content-Length': documentData.buffer.length.toString(),
      'Content-Disposition': `inline; filename="${encodeURIComponent(document.fileName)}"`,
      'Cache-Control': 'private, no-cache',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    });

    res.send(documentData.buffer);

  } catch (error) {
    console.error('Document view error:', error);
    res.status(500).json({ message: 'Ошибка просмотра документа' });
  }
});

// Delete document
router.delete('/:documentId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { documentId } = req.params;

    // Получаем метаданные документа
    const document = await storage.getDocument(documentId);
    
    if (!document) {
      return res.status(404).json({ message: 'Документ не найден' });
    }

    // Проверяем права доступа (пользователь может просматривать только свои документы, либо админ)
    const isAdmin = req.user!.adminRole && ['super_admin', 'security_admin'].includes(req.user!.adminRole);
    if (document.userId !== userId && !isAdmin) {
      return res.status(403).json({ message: 'Нет доступа к документу' });
    }

    // Удаляем файл с диска
    await documentStorageService.deleteDocument(userId, document.filePath);

    // Удаляем запись из базы данных
    await storage.deleteDocument(documentId);

    res.json({ message: 'Документ успешно удален' });

  } catch (error) {
    console.error('Document delete error:', error);
    res.status(500).json({ message: 'Ошибка удаления документа' });
  }
});

export default router;