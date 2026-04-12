# Оптимизация Storage Layer - Service архитектура

**Дата создания**: 8 сентября 2025  
**Статус**: Планирование архитектуры  
**Цель**: Создание Service слоев для модуляризации storage.ts

## 🎯 Анализ текущего состояния

### Проблемы текущего storage.ts
- **Размер**: 1304 строки в одном файле
- **Сложность**: 9+ доменов в одном классе
- **Методы**: 125+ методов в одном интерфейсе IStorage
- **Ответственность**: Смешение CRUD операций с бизнес-логикой
- **Тестирование**: Сложность изолированного тестирования доменов

### Домены в текущем storage.ts
1. **User Management** - пользователи, профили, аутентификация
2. **Bank Operations** - подключения к банкам, ПКС интеграция
3. **Account Management** - счета, балансы
4. **Transaction Processing** - транзакции, категоризация
5. **Budget & Savings** - бюджеты, цели накоплений
6. **Analytics** - аналитика, отчеты, метрики
7. **AI Operations** - чат с AI, сессии
8. **Family Groups** - семейные группы и управление
9. **Admin Operations** - админ функции, логи, мониторинг
10. **Document Management** - документы, верификация

## 🏗️ Предлагаемая архитектура Service слоев

### Структура директорий
```
server/services/
├── BaseService.ts          # Базовый класс с общими методами
├── UserService.ts          # Управление пользователями, профили
├── BankService.ts          # Интеграция с банками, ПКС
├── AccountService.ts       # Счета, балансы, синхронизация
├── TransactionService.ts   # Транзакции, категоризация, анализ
├── BudgetService.ts        # Бюджеты, цели накоплений
├── AnalyticsService.ts     # Аналитика, отчеты, метрики
├── AiService.ts           # AI ассистент, чат сессии
├── FamilyService.ts       # Семейные группы, приглашения
├── AdminService.ts        # Админ операции, логи, мониторинг
└── DocumentService.ts     # Документы, верификация, шифрование
```

### Принципы архитектуры

#### Single Responsibility Principle
- Каждый сервис отвечает за один домен
- Четкое разделение бизнес-логики и CRUD операций
- Storage остается простым Data Access Layer

#### Dependency Injection
- Сервисы получают зависимости через конструктор
- Легкость тестирования и моккинга
- Слабая связанность между компонентами

#### Layered Architecture
```
Controllers (Routes) 
    ↓
Business Logic (Services)
    ↓ 
Data Access (Storage)
    ↓
Database (PostgreSQL)
```

## 🚀 Преимущества Service архитектуры

### 1. Архитектурные преимущества

**Модульность**
- Независимые, переиспользуемые компоненты
- Возможность извлечения в отдельные npm пакеты
- Подготовка к микросервисной архитектуре

**Масштабируемость**
- Легкое добавление новой функциональности
- Горизонтальное масштабирование по доменам
- Независимое развитие команд

**Тестируемость**
- Изолированное unit-тестирование каждого домена
- Моккинг зависимостей
- Integration тесты на уровне сервисов

### 2. Бизнес-логика и производительность

**Инкапсуляция бизнес-правил**
- Централизованная валидация данных
- Сложные workflow в одном месте
- Консистентность бизнес-операций

**Оптимизация производительности**
- Кэширование на уровне сервисов
- Batch операции для связанных данных
- Ленивая загрузка и агрегация

**Обработка ошибок**
- Централизованная обработка исключений
- Retry логика для внешних API
- Graceful degradation при сбоях

### 3. Безопасность и аудит

**Централизованное логирование**
- Аудит всех операций по доменам
- Трекинг изменений данных
- Мониторинг подозрительной активности

**Контроль доступа**
- Проверки авторизации на уровне сервисов
- Валидация прав пользователей
- Защита от IDOR атак

**Соответствие требованиям**
- 152-ФЗ о персональных данных
- Требования ЦБ РФ для ПКС
- GDPR compliance для международных пользователей

### 4. Российская специфика

**ПКС (Open Banking) интеграция**
- Сложная логика в BankService
- Обработка различных форматов банков
- Синхронизация данных с банковскими API

**Интеграция с ЕСИА (Госуслуги)**
- Верификация через государственные сервисы
- Автоматическое заполнение профиля
- Compliance с государственными стандартами

**Российские платежные системы**
- ЮKassa, CloudPayments, Сбербанк Эквайринг
- Специфика российского законодательства
- Валютное регулирование

## 💡 Примеры реализации

### BaseService - общий функционал
```typescript
export abstract class BaseService {
  protected logger: Logger;
  protected cache: CacheService;
  
  constructor(
    protected storage: IStorage,
    logger?: Logger,
    cache?: CacheService
  ) {
    this.logger = logger || new Logger(this.constructor.name);
    this.cache = cache || new CacheService();
  }

  protected async withTransaction<T>(
    operation: (storage: IStorage) => Promise<T>
  ): Promise<T> {
    // Транзакционная обертка
  }

  protected validateUserId(userId: string): void {
    // Общая валидация
  }

  protected async auditLog(
    action: string, 
    userId: string, 
    metadata?: any
  ): Promise<void> {
    // Централизованное логирование
  }
}
```

### UserService - управление пользователями
```typescript
export class UserService extends BaseService {
  
  async getUserProfile(userId: string): Promise<UserProfile> {
    this.validateUserId(userId);
    
    // Проверяем кэш
    const cached = await this.cache.get(`user:${userId}`);
    if (cached) return cached;
    
    // Агрегируем данные пользователя
    const user = await this.storage.getUser(userId);
    const documents = await this.storage.getUserDocuments(userId);
    const bankConnections = await this.storage.getBankConnections(userId);
    
    const profile: UserProfile = {
      ...user,
      documentsVerified: documents.every(d => d.status === 'verified'),
      banksConnected: bankConnections.length,
      // Другие агрегированные данные
    };
    
    // Кэшируем результат
    await this.cache.set(`user:${userId}`, profile, 300); // 5 минут
    
    await this.auditLog('getUserProfile', userId);
    return profile;
  }

  async updateUserProfile(
    userId: string, 
    updates: ProfileUpdates
  ): Promise<User> {
    this.validateUserId(userId);
    
    // Валидация обновлений
    await this.validateProfileUpdates(updates);
    
    return await this.withTransaction(async (storage) => {
      // Логируем изменения
      const oldUser = await storage.getUser(userId);
      
      // Обновляем пользователя
      const updatedUser = await storage.updateUser(userId, updates);
      
      // Инвалидируем кэш
      await this.cache.delete(`user:${userId}`);
      
      // Аудит лог
      await this.auditLog('updateProfile', userId, {
        oldData: oldUser,
        newData: updatedUser
      });
      
      // Уведомления о важных изменениях
      if (updates.email && updates.email !== oldUser?.email) {
        await this.sendEmailChangeNotification(userId, updates.email);
      }
      
      return updatedUser;
    });
  }
  
  private async validateProfileUpdates(updates: ProfileUpdates): Promise<void> {
    // Бизнес-валидация
    if (updates.phone && !this.isValidRussianPhone(updates.phone)) {
      throw new ValidationError('Некорректный российский номер телефона');
    }
    // Другие проверки...
  }
}
```

### BankService - банковские операции
```typescript
export class BankService extends BaseService {
  
  async connectBank(
    userId: string, 
    bankCode: string, 
    credentials: BankCredentials
  ): Promise<BankConnection> {
    this.validateUserId(userId);
    
    return await this.withTransaction(async (storage) => {
      // Проверяем лимиты подключений
      const existingConnections = await storage.getBankConnections(userId);
      if (existingConnections.length >= 10) {
        throw new BusinessError('Превышен лимит подключенных банков');
      }
      
      // Интеграция с ПКС (Open Banking)
      const bankApi = this.getBankApiService(bankCode);
      const authResult = await bankApi.authenticate(credentials);
      
      // Создаем подключение
      const connection = await storage.createBankConnection({
        userId,
        bankCode,
        accessToken: await this.encrypt(authResult.accessToken),
        refreshToken: await this.encrypt(authResult.refreshToken),
        expiresAt: authResult.expiresAt,
        status: 'active'
      });
      
      // Синхронизируем счета
      await this.syncBankAccounts(connection.id, bankApi);
      
      await this.auditLog('connectBank', userId, { bankCode });
      return connection;
    });
  }
  
  async syncAllBankData(userId: string): Promise<SyncResult> {
    const connections = await this.storage.getBankConnections(userId);
    const results: SyncResult[] = [];
    
    for (const connection of connections) {
      try {
        const bankApi = this.getBankApiService(connection.bankCode);
        const syncResult = await this.syncBankAccounts(connection.id, bankApi);
        results.push(syncResult);
      } catch (error) {
        this.logger.error(`Sync failed for bank ${connection.bankCode}`, error);
        results.push({ 
          bankCode: connection.bankCode, 
          success: false, 
          error: error.message 
        });
      }
    }
    
    await this.auditLog('syncAllBankData', userId, { results });
    return { results };
  }
}
```

## 📊 Упрощенный Storage Layer

После внедрения сервисов, storage.ts станет простым DAO:

```typescript
// Простой интерфейс только для CRUD операций
export interface IUserStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;
}

export interface IBankStorage {
  getBankConnections(userId: string): Promise<BankConnection[]>;
  createBankConnection(connection: InsertBankConnection): Promise<BankConnection>;
  updateBankConnection(id: string, updates: Partial<BankConnection>): Promise<BankConnection>;
  // Только базовые CRUD операции
}
```

## 🔄 План миграции

### Этап 1: Подготовка инфраструктуры
1. ✅ Создать BaseService с общими методами
2. ✅ Настроить логирование и кэширование
3. ✅ Создать интерфейсы для сервисов

### Этап 2: Создание доменных сервисов
1. ✅ UserService - базовый функционал пользователей
2. ✅ BankService - интеграция с банками и ПКС
3. ✅ TransactionService - обработка транзакций
4. ✅ DocumentService - верификация документов

### Этап 3: Рефакторинг роутеров
1. ✅ Обновить auth роутеры для использования UserService
2. ✅ Обновить bank роутеры для использования BankService
3. ✅ Обновить document роутеры для использования DocumentService
4. ✅ Добавить обработку ошибок на уровне сервисов

### Этап 4: Упрощение Storage
1. ✅ Разделить IStorage на доменные интерфейсы
2. ✅ Удалить бизнес-логику из storage.ts
3. ✅ Оставить только CRUD операции
4. ✅ Оптимизировать SQL запросы

### Этап 5: Тестирование и оптимизация
1. ✅ Unit тесты для каждого сервиса
2. ✅ Integration тесты между сервисами
3. ✅ Нагрузочное тестирование
4. ✅ Мониторинг производительности

## 💪 Ожидаемые результаты

### Количественные показатели
- **Сокращение storage.ts**: с 1304 до ~400 строк (-70%)
- **Увеличение тестируемости**: покрытие кода 90%+
- **Производительность**: 30-50% ускорение за счет кэширования
- **Время разработки**: сокращение на 40% за счет модульности

### Качественные улучшения
- ✅ **Чистая архитектура** с четким разделением слоев
- ✅ **Простота поддержки** - каждый домен изолирован
- ✅ **Готовность к микросервисам** - сервисы легко выделить
- ✅ **Улучшенная безопасность** и аудит операций
- ✅ **Enterprise-grade** архитектура
- ✅ **Соответствие российским требованиям** (ЦБ РФ, 152-ФЗ)

## 🎯 Заключение

Создание Service слоев для storage.ts является критически важным шагом для:

1. **Архитектурной зрелости** проекта FinTrack
2. **Подготовки к production** развертыванию
3. **Масштабирования команды** разработки
4. **Соответствия enterprise стандартам**
5. **Готовности к извлечению в библиотеку компонентов**

**Рекомендация**: Начать с создания BaseService и UserService как proof of concept, затем поэтапно мигрировать остальные домены.

---

*Документ создан в рамках архитектурной оптимизации FinTrack MVP для российского fintech рынка.*