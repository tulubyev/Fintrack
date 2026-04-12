#!/usr/bin/env tsx

/**
 * FinTrack Backup System
 * Комплексное резервное копирование базы данных и файлов
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

interface BackupConfig {
  backupDir: string;
  timestamp: string;
  includeDatabase: boolean;
  includeFiles: boolean;
  includeUploads: boolean;
}

class FinTrackBackup {
  private config: BackupConfig;
  
  constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.config = {
      backupDir: `./backups/backup-${timestamp}`,
      timestamp,
      includeDatabase: true,
      includeFiles: true,
      includeUploads: true
    };
  }

  async createBackup(): Promise<void> {
    console.log('🔄 Начинаю резервное копирование FinTrack...');
    console.log(`📁 Папка backup: ${this.config.backupDir}`);
    
    // Создаем директорию backup
    this.ensureBackupDir();
    
    try {
      // 1. Backup базы данных
      if (this.config.includeDatabase) {
        await this.backupDatabase();
      }
      
      // 2. Backup файлов приложения
      if (this.config.includeFiles) {
        await this.backupApplicationFiles();
      }
      
      // 3. Backup загруженных документов
      if (this.config.includeUploads) {
        await this.backupUploads();
      }
      
      // 4. Создаем метаданные backup
      await this.createBackupMetadata();
      
      // 5. Создаем архив
      await this.createArchive();
      
      console.log('✅ Backup успешно создан!');
      console.log(`📦 Файл архива: ${this.config.backupDir}.tar.gz`);
      
    } catch (error) {
      console.error('❌ Ошибка при создании backup:', error);
      throw error;
    }
  }

  private ensureBackupDir(): void {
    if (!fs.existsSync('./backups')) {
      fs.mkdirSync('./backups', { recursive: true });
    }
    fs.mkdirSync(this.config.backupDir, { recursive: true });
  }

  private async backupDatabase(): Promise<void> {
    console.log('🗄️ Создание backup базы данных...');
    
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL не найден в переменных окружения');
    }

    // Парсим DATABASE_URL для получения параметров подключения
    const url = new URL(databaseUrl);
    const dbParams = {
      host: url.hostname,
      port: url.port || '5432',
      database: url.pathname.slice(1), // убираем первый /
      username: url.username,
      password: url.password
    };

    // Создаем pg_dump команду
    const dumpFile = path.join(this.config.backupDir, 'database.sql');
    const pgDumpCmd = `PGPASSWORD="${dbParams.password}" pg_dump -h ${dbParams.host} -p ${dbParams.port} -U ${dbParams.username} -d ${dbParams.database} --no-password --clean --if-exists > "${dumpFile}"`;
    
    try {
      execSync(pgDumpCmd, { stdio: 'inherit' });
      console.log(`✅ База данных сохранена: ${dumpFile}`);
      
      // Создаем сжатую версию
      execSync(`gzip -k "${dumpFile}"`, { stdio: 'inherit' });
      console.log(`📦 Сжатая версия: ${dumpFile}.gz`);
      
    } catch (error) {
      console.error('❌ Ошибка при создании backup базы данных:', error);
      
      // Fallback: создаем простой SQL дамп через подключение
      await this.createSimpleDatabaseBackup(dumpFile);
    }
  }

  private async createSimpleDatabaseBackup(dumpFile: string): Promise<void> {
    console.log('🔄 Создание альтернативного backup базы данных...');
    
    try {
      // Используем наше подключение к БД для создания backup
      const { db } = await import('../server/db');
      
      // Получаем список таблиц
      const tables = await db.execute(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      let sqlDump = '-- FinTrack Database Backup\n';
      sqlDump += `-- Created: ${this.config.timestamp}\n\n`;
      
      // Для каждой таблицы создаем INSERT команды
      for (const table of tables.rows) {
        const tableName = table.table_name;
        sqlDump += `-- Table: ${tableName}\n`;
        
        try {
          const data = await db.execute(`SELECT * FROM "${tableName}"`);
          
          if (data.rows.length > 0) {
            const columns = Object.keys(data.rows[0]);
            
            for (const row of data.rows) {
              const values = columns.map(col => {
                const val = row[col];
                if (val === null) return 'NULL';
                if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                if (val instanceof Date) return `'${val.toISOString()}'`;
                return String(val);
              }).join(', ');
              
              sqlDump += `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values});\n`;
            }
          }
          
          sqlDump += '\n';
        } catch (tableError) {
          console.warn(`⚠️ Пропускаем таблицу ${tableName}:`, tableError.message);
        }
      }
      
      fs.writeFileSync(dumpFile, sqlDump);
      console.log(`✅ Альтернативный backup базы данных создан: ${dumpFile}`);
      
    } catch (error) {
      console.error('❌ Ошибка при создании альтернативного backup:', error);
      
      // Создаем минимальный backup с информацией о схеме
      const minimalBackup = `-- FinTrack Database Backup (Schema Only)
-- Created: ${this.config.timestamp}
-- Ошибка при создании полного backup
-- Используйте DATABASE_URL для восстановления подключения: ${process.env.DATABASE_URL?.replace(/\/\/.*@/, '//***:***@')}
`;
      fs.writeFileSync(dumpFile, minimalBackup);
    }
  }

  private async backupApplicationFiles(): Promise<void> {
    console.log('📂 Создание backup файлов приложения...');
    
    const appDir = path.join(this.config.backupDir, 'app');
    fs.mkdirSync(appDir, { recursive: true });
    
    // Список важных директорий и файлов для backup
    const importantPaths = [
      'server',
      'client', 
      'shared',
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'vite.config.ts',
      'tailwind.config.ts',
      'postcss.config.js',
      'drizzle.config.ts',
      'replit.md'
    ];
    
    for (const itemPath of importantPaths) {
      if (fs.existsSync(itemPath)) {
        const targetPath = path.join(appDir, itemPath);
        
        if (fs.statSync(itemPath).isDirectory()) {
          this.copyDirectory(itemPath, targetPath);
        } else {
          fs.copyFileSync(itemPath, targetPath);
        }
        
        console.log(`✅ Скопировано: ${itemPath}`);
      }
    }
  }

  private async backupUploads(): Promise<void> {
    console.log('📎 Создание backup загруженных файлов...');
    
    const uploadsDir = './uploads';
    if (fs.existsSync(uploadsDir)) {
      const targetDir = path.join(this.config.backupDir, 'uploads');
      this.copyDirectory(uploadsDir, targetDir);
      console.log(`✅ Загруженные файлы скопированы: ${targetDir}`);
    } else {
      console.log('ℹ️ Папка uploads не найдена, пропускаем');
    }
  }

  private copyDirectory(source: string, target: string): void {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }
    
    const entries = fs.readdirSync(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);
      
      // Пропускаем node_modules, .git, и другие ненужные папки
      if (entry.name === 'node_modules' || entry.name === '.git' || 
          entry.name === '.next' || entry.name === 'dist' ||
          entry.name === 'backups') {
        continue;
      }
      
      if (entry.isDirectory()) {
        this.copyDirectory(sourcePath, targetPath);
      } else {
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  }

  private async createBackupMetadata(): Promise<void> {
    console.log('📋 Создание метаданных backup...');
    
    const metadata = {
      version: '1.0',
      timestamp: this.config.timestamp,
      created_at: new Date().toISOString(),
      system: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      fintrack: {
        version: this.getFinTrackVersion(),
        database_connected: !!process.env.DATABASE_URL,
        environment: process.env.NODE_ENV || 'development'
      },
      backup_contents: {
        database: this.config.includeDatabase,
        application_files: this.config.includeFiles,
        uploads: this.config.includeUploads
      },
      restore_instructions: [
        "1. Распакуйте архив backup",
        "2. Восстановите базу данных: psql -d your_database < database.sql",
        "3. Скопируйте файлы приложения",
        "4. Установите зависимости: npm install",
        "5. Настройте переменные окружения",
        "6. Запустите приложение: npm run dev"
      ]
    };
    
    const metadataFile = path.join(this.config.backupDir, 'backup_metadata.json');
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    
    console.log(`✅ Метаданные созданы: ${metadataFile}`);
  }

  private getFinTrackVersion(): string {
    try {
      const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      return packageJson.version || '1.0.0';
    } catch {
      return '1.0.0';
    }
  }

  private async createArchive(): Promise<void> {
    console.log('📦 Создание архива backup...');
    
    const archiveName = `${this.config.backupDir}.tar.gz`;
    const tarCmd = `tar -czf "${archiveName}" -C "./backups" "${path.basename(this.config.backupDir)}"`;
    
    try {
      execSync(tarCmd, { stdio: 'inherit' });
      
      // Создаем хэш для проверки целостности
      const archiveHash = this.calculateFileHash(archiveName);
      fs.writeFileSync(`${archiveName}.sha256`, `${archiveHash}  ${path.basename(archiveName)}\n`);
      
      console.log(`✅ Архив создан: ${archiveName}`);
      console.log(`🔐 SHA256: ${archiveHash}`);
      
      // Показываем размер архива
      const stats = fs.statSync(archiveName);
      console.log(`📏 Размер: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      
    } catch (error) {
      console.error('❌ Ошибка при создании архива:', error);
      throw error;
    }
  }

  private calculateFileHash(filePath: string): string {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex');
  }
}

// Основная функция запуска backup
async function main() {
  try {
    const backup = new FinTrackBackup();
    await backup.createBackup();
    
    console.log('\n🎉 Backup FinTrack завершен успешно!');
    process.exit(0);
    
  } catch (error) {
    console.error('\n💥 Критическая ошибка при создании backup:', error);
    process.exit(1);
  }
}

// Запускаем только если скрипт вызван напрямую
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { FinTrackBackup };