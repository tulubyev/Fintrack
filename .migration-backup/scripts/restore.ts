#!/usr/bin/env tsx

/**
 * FinTrack Restore System
 * Восстановление системы из backup
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

interface RestoreConfig {
  backupPath: string;
  restoreDir: string;
  verifyIntegrity: boolean;
  restoreDatabase: boolean;
  restoreFiles: boolean;
  restoreUploads: boolean;
}

class FinTrackRestore {
  private config: RestoreConfig;
  
  constructor(backupPath: string, options: Partial<RestoreConfig> = {}) {
    this.config = {
      backupPath,
      restoreDir: './restored',
      verifyIntegrity: true,
      restoreDatabase: true,
      restoreFiles: true,
      restoreUploads: true,
      ...options
    };
  }

  async restoreFromBackup(): Promise<void> {
    console.log('🔄 Начинаю восстановление FinTrack из backup...');
    console.log(`📦 Backup файл: ${this.config.backupPath}`);
    
    try {
      // 1. Проверяем целостность архива
      if (this.config.verifyIntegrity) {
        await this.verifyBackupIntegrity();
      }
      
      // 2. Извлекаем архив
      await this.extractBackup();
      
      // 3. Читаем метаданные
      const metadata = await this.readBackupMetadata();
      console.log(`📋 Backup создан: ${metadata.created_at}`);
      console.log(`🔖 Версия FinTrack: ${metadata.fintrack?.version || 'неизвестно'}`);
      
      // 4. Восстанавливаем базу данных
      if (this.config.restoreDatabase && metadata.backup_contents?.database) {
        await this.restoreDatabase();
      }
      
      // 5. Восстанавливаем файлы приложения
      if (this.config.restoreFiles && metadata.backup_contents?.application_files) {
        await this.restoreApplicationFiles();
      }
      
      // 6. Восстанавливаем загруженные файлы
      if (this.config.restoreUploads && metadata.backup_contents?.uploads) {
        await this.restoreUploads();
      }
      
      // 7. Показываем инструкции по завершению
      this.showCompletionInstructions(metadata);
      
      console.log('✅ Восстановление завершено успешно!');
      
    } catch (error) {
      console.error('❌ Ошибка при восстановлении:', error);
      throw error;
    }
  }

  private async verifyBackupIntegrity(): Promise<void> {
    console.log('🔐 Проверка целостности backup...');
    
    const hashFile = `${this.config.backupPath}.sha256`;
    
    if (!fs.existsSync(hashFile)) {
      console.warn('⚠️ Файл хэша не найден, пропускаем проверку целостности');
      return;
    }
    
    // Читаем ожидаемый хэш
    const expectedHash = fs.readFileSync(hashFile, 'utf8').split(' ')[0];
    
    // Вычисляем актуальный хэш
    const actualHash = this.calculateFileHash(this.config.backupPath);
    
    if (expectedHash === actualHash) {
      console.log('✅ Целостность backup подтверждена');
    } else {
      throw new Error(`Нарушена целостность backup! Ожидался: ${expectedHash}, получен: ${actualHash}`);
    }
  }

  private calculateFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }

  private async extractBackup(): Promise<void> {
    console.log('📦 Извлечение backup архива...');
    
    // Создаем директорию для восстановления
    if (fs.existsSync(this.config.restoreDir)) {
      fs.rmSync(this.config.restoreDir, { recursive: true });
    }
    fs.mkdirSync(this.config.restoreDir, { recursive: true });
    
    // Извлекаем tar.gz архив
    const extractCmd = `tar -xzf "${this.config.backupPath}" -C "${this.config.restoreDir}" --strip-components=1`;
    
    try {
      execSync(extractCmd, { stdio: 'inherit' });
      console.log(`✅ Архив извлечен в: ${this.config.restoreDir}`);
    } catch (error) {
      throw new Error(`Ошибка при извлечении архива: ${error}`);
    }
  }

  private async readBackupMetadata(): Promise<any> {
    const metadataPath = path.join(this.config.restoreDir, 'backup_metadata.json');
    
    if (!fs.existsSync(metadataPath)) {
      console.warn('⚠️ Метаданные backup не найдены');
      return {};
    }
    
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
      return metadata;
    } catch (error) {
      console.warn('⚠️ Ошибка при чтении метаданных:', error);
      return {};
    }
  }

  private async restoreDatabase(): Promise<void> {
    console.log('🗄️ Восстановление базы данных...');
    
    const sqlFile = path.join(this.config.restoreDir, 'database.sql');
    const gzFile = `${sqlFile}.gz`;
    
    // Проверяем наличие файлов базы данных
    let databaseFile = sqlFile;
    if (fs.existsSync(gzFile)) {
      console.log('📦 Найден сжатый файл базы данных, распаковываем...');
      execSync(`gunzip -k "${gzFile}"`, { stdio: 'inherit' });
      databaseFile = sqlFile;
    } else if (!fs.existsSync(sqlFile)) {
      throw new Error('Файл базы данных не найден в backup');
    }
    
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      console.error('❌ DATABASE_URL не найден в переменных окружения');
      console.log(`📄 SQL файл сохранен в: ${databaseFile}`);
      console.log('ℹ️ Восстановите базу данных вручную командой:');
      console.log(`   psql -d your_database < "${databaseFile}"`);
      return;
    }

    // Парсим DATABASE_URL
    const url = new URL(databaseUrl);
    const dbParams = {
      host: url.hostname,
      port: url.port || '5432',
      database: url.pathname.slice(1),
      username: url.username,
      password: url.password
    };

    // Выполняем восстановление
    const restoreCmd = `PGPASSWORD="${dbParams.password}" psql -h ${dbParams.host} -p ${dbParams.port} -U ${dbParams.username} -d ${dbParams.database} < "${databaseFile}"`;
    
    try {
      console.log('🔄 Выполняется восстановление базы данных...');
      execSync(restoreCmd, { stdio: 'inherit' });
      console.log('✅ База данных восстановлена');
    } catch (error) {
      console.error('❌ Ошибка при восстановлении базы данных:', error);
      console.log(`📄 SQL файл доступен в: ${databaseFile}`);
      console.log('ℹ️ Попробуйте восстановить вручную');
    }
  }

  private async restoreApplicationFiles(): Promise<void> {
    console.log('📂 Восстановление файлов приложения...');
    
    const appDir = path.join(this.config.restoreDir, 'app');
    if (!fs.existsSync(appDir)) {
      console.warn('⚠️ Папка с файлами приложения не найдена в backup');
      return;
    }
    
    // Создаем резервную копию текущих файлов
    const backupCurrentDir = `./current_backup_${Date.now()}`;
    console.log(`📋 Создание резервной копии текущих файлов в: ${backupCurrentDir}`);
    
    try {
      fs.mkdirSync(backupCurrentDir, { recursive: true });
      
      // Копируем важные файлы
      const importantFiles = ['server', 'client', 'shared', 'package.json', 'replit.md'];
      for (const item of importantFiles) {
        if (fs.existsSync(item)) {
          const target = path.join(backupCurrentDir, item);
          if (fs.statSync(item).isDirectory()) {
            this.copyDirectory(item, target);
          } else {
            fs.copyFileSync(item, target);
          }
        }
      }
      
      console.log('✅ Резервная копия текущих файлов создана');
    } catch (error) {
      console.warn('⚠️ Не удалось создать резервную копию текущих файлов:', error);
    }
    
    // Восстанавливаем файлы из backup
    const entries = fs.readdirSync(appDir, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = path.join(appDir, entry.name);
      const targetPath = `./${entry.name}`;
      
      try {
        if (entry.isDirectory()) {
          this.copyDirectory(sourcePath, targetPath);
        } else {
          fs.copyFileSync(sourcePath, targetPath);
        }
        console.log(`✅ Восстановлено: ${entry.name}`);
      } catch (error) {
        console.warn(`⚠️ Не удалось восстановить ${entry.name}:`, error);
      }
    }
  }

  private async restoreUploads(): Promise<void> {
    console.log('📎 Восстановление загруженных файлов...');
    
    const uploadsDir = path.join(this.config.restoreDir, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      console.log('ℹ️ Загруженные файлы не найдены в backup');
      return;
    }
    
    const targetDir = './uploads';
    if (fs.existsSync(targetDir)) {
      const backupUploadsDir = `./uploads_backup_${Date.now()}`;
      fs.renameSync(targetDir, backupUploadsDir);
      console.log(`📋 Текущие загрузки сохранены в: ${backupUploadsDir}`);
    }
    
    this.copyDirectory(uploadsDir, targetDir);
    console.log(`✅ Загруженные файлы восстановлены: ${targetDir}`);
  }

  private copyDirectory(source: string, target: string): void {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }
    
    const entries = fs.readdirSync(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      
      if (entry.isDirectory()) {
        this.copyDirectory(sourcePath, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  private showCompletionInstructions(metadata: any): void {
    console.log('\n🎯 Инструкции по завершению восстановления:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (metadata.restore_instructions) {
      metadata.restore_instructions.forEach((instruction: string, index: number) => {
        console.log(`${index + 1}. ${instruction}`);
      });
    } else {
      console.log('1. Проверьте восстановленные файлы');
      console.log('2. Установите зависимости: npm install');
      console.log('3. Настройте переменные окружения');
      console.log('4. Запустите приложение: npm run dev');
    }
    
    console.log('\n📝 Дополнительные шаги:');
    console.log('• Проверьте настройки базы данных');
    console.log('• Обновите секреты и API ключи');
    console.log('• Протестируйте основные функции');
    console.log('• Создайте новый backup после проверки');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
}

// Основная функция для CLI использования
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Использование: tsx restore.ts <путь_к_backup_архиву>');
    console.log('Пример: tsx restore.ts ./backups/backup-2025-01-15T10-30-00.tar.gz');
    process.exit(1);
  }
  
  const backupPath = args[0];
  
  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Файл backup не найден: ${backupPath}`);
    process.exit(1);
  }
  
  try {
    const restore = new FinTrackRestore(backupPath);
    await restore.restoreFromBackup();
    
    console.log('\n🎉 Восстановление FinTrack завершено!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n💥 Критическая ошибка при восстановлении:', error);
    process.exit(1);
  }
}

// Запускаем только если скрипт вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { FinTrackRestore };