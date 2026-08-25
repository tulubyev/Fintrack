import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface StoredDocumentInfo {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  encryptedPath: string;
  checksum: string;
  uploadedAt: Date;
  userId: string;
}

export class DocumentStorageService {
  private readonly documentsDir: string;
  private readonly encryptionKey: string;
  
  constructor() {
    // Защищенная папка для документов в корне проекта (доступна через редактор)
    this.documentsDir = path.join(process.cwd(), 'saveddata');
    
    // Используем системный ключ шифрования
    this.encryptionKey = process.env.ENCRYPTION_KEY || 'dev-encryption-key-32-bytes-long!';
    
    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.documentsDir, { recursive: true });
      
      // Устанавливаем строгие права доступа (только для владельца)
      await fs.chmod(this.documentsDir, 0o700);
      
      // Создаем .htaccess для дополнительной защиты
      const htaccessPath = path.join(this.documentsDir, '.htaccess');
      await fs.writeFile(htaccessPath, 'Deny from all\n');
      
    } catch (error) {
      console.error('Error initializing document storage:', error);
    }
  }

  // Шифрование файла с помощью AES-256
  private encryptBuffer(buffer: Buffer): { encrypted: Buffer; iv: Buffer } {
    const iv = crypto.randomBytes(16);
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(buffer),
      cipher.final()
    ]);
    
    return { encrypted, iv };
  }

  // Расшифровка файла
  private decryptBuffer(encrypted: Buffer, iv: Buffer): Buffer {
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
  }

  // Вычисление контрольной суммы
  private calculateChecksum(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  // Генерация безопасного имени файла
  private generateSecureFileName(userId: string, originalName: string): string {
    const ext = path.extname(originalName);
    const timestamp = Date.now();
    const random = uuidv4().substring(0, 8);
    const hash = crypto.createHash('md5').update(userId + originalName + timestamp).digest('hex').substring(0, 8);
    
    return `doc_${hash}_${timestamp}_${random}${ext}.enc`;
  }

  // Проверка безопасности пути файла (защита от Path Traversal)
  private validatePath(filePath: string): boolean {
    const resolvedPath = path.resolve(filePath);
    const secureDir = path.resolve(this.documentsDir);
    
    return resolvedPath.startsWith(secureDir);
  }

  // Сохранение документа с шифрованием
  async storeDocument(
    userId: string, 
    buffer: Buffer, 
    originalName: string, 
    mimeType: string
  ): Promise<StoredDocumentInfo> {
    try {
      // Валидация входных данных
      if (!userId || !buffer || !originalName) {
        throw new Error('Недостаточно данных для сохранения документа');
      }

      // Проверка размера файла (максимум 50MB)
      if (buffer.length > 50 * 1024 * 1024) {
        throw new Error('Файл слишком большой (максимум 50MB)');
      }

      // Проверка типа файла (только изображения и PDF)
      const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf'
      ];
      
      if (!allowedTypes.includes(mimeType)) {
        throw new Error('Неподдерживаемый тип файла');
      }

      // Генерируем безопасное имя файла
      const secureFileName = this.generateSecureFileName(userId, originalName);
      const filePath = path.join(this.documentsDir, secureFileName);
      
      // Проверяем безопасность пути
      if (!this.validatePath(filePath)) {
        throw new Error('Небезопасный путь к файлу');
      }

      // Шифруем файл
      const { encrypted, iv } = this.encryptBuffer(buffer);
      
      // Вычисляем контрольную сумму оригинального файла
      const checksum = this.calculateChecksum(buffer);
      
      // Создаем финальный зашифрованный буфер (IV + encrypted data)
      const finalBuffer = Buffer.concat([iv, encrypted]);
      
      // Сохраняем зашифрованный файл
      await fs.writeFile(filePath, finalBuffer);
      
      // Устанавливаем строгие права доступа
      await fs.chmod(filePath, 0o600);
      
      const documentInfo: StoredDocumentInfo = {
        id: uuidv4(),
        originalName,
        mimeType,
        size: buffer.length,
        encryptedPath: secureFileName,
        checksum,
        uploadedAt: new Date(),
        userId
      };

      return documentInfo;

    } catch (error) {
      console.error('Document storage error:', error);
      throw error;
    }
  }

  // Получение документа с расшифровкой
  async retrieveDocument(
    userId: string, 
    encryptedPath: string
  ): Promise<{ buffer: Buffer; info: Partial<StoredDocumentInfo> } | null> {
    try {
      const filePath = path.join(this.documentsDir, encryptedPath);
      
      // Проверяем безопасность пути
      if (!this.validatePath(filePath)) {
        throw new Error('Небезопасный путь к файлу');
      }

      // Проверяем существование файла
      try {
        await fs.access(filePath);
      } catch {
        return null;
      }

      // Читаем зашифрованный файл
      const encryptedBuffer = await fs.readFile(filePath);
      
      // Извлекаем IV и данные
      const iv = encryptedBuffer.slice(0, 16);
      const encrypted = encryptedBuffer.slice(16);
      
      // Расшифровываем
      const decrypted = this.decryptBuffer(encrypted, iv);
      
      return {
        buffer: decrypted,
        info: {
          size: decrypted.length,
          userId,
          encryptedPath
        }
      };

    } catch (error) {
      console.error('Document retrieval error:', error);
      throw error;
    }
  }

  // Удаление документа
  async deleteDocument(userId: string, encryptedPath: string): Promise<boolean> {
    try {
      const filePath = path.join(this.documentsDir, encryptedPath);
      
      // Проверяем безопасность пути
      if (!this.validatePath(filePath)) {
        throw new Error('Небезопасный путь к файлу');
      }

      // Удаляем файл
      await fs.unlink(filePath);
      return true;

    } catch (error) {
      console.error('Document deletion error:', error);
      return false;
    }
  }

  // Получение информации о хранилище
  async getStorageInfo(): Promise<{
    totalFiles: number;
    totalSize: number;
    secureDir: string;
  }> {
    try {
      const files = await fs.readdir(this.documentsDir);
      let totalSize = 0;
      
      for (const file of files) {
        if (file !== '.htaccess') {
          const filePath = path.join(this.documentsDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        }
      }
      
      return {
        totalFiles: files.length - 1, // исключаем .htaccess
        totalSize,
        secureDir: this.documentsDir
      };
      
    } catch (error) {
      console.error('Storage info error:', error);
      return {
        totalFiles: 0,
        totalSize: 0,
        secureDir: this.documentsDir
      };
    }
  }

  // Проверка целостности документа
  async verifyDocument(userId: string, encryptedPath: string, expectedChecksum: string): Promise<boolean> {
    try {
      const document = await this.retrieveDocument(userId, encryptedPath);
      if (!document) return false;
      
      const actualChecksum = this.calculateChecksum(document.buffer);
      return actualChecksum === expectedChecksum;
      
    } catch (error) {
      console.error('Document verification error:', error);
      return false;
    }
  }
}

// Экспортируем единственный экземпляр
export const documentStorageService = new DocumentStorageService();