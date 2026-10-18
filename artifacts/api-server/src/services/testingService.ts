import { storage } from "../storage";
import { authService } from "./authService";
import type { User, InsertUser, InsertFamilyGroup, InsertFamilyGroupMember } from "@shared/schema";

interface TestUser {
  user: User;
  credentials: {
    phone: string;
    password: string;
  };
  role: string;
  planType: string;
}

interface TestScenario {
  name: string;
  description: string;
  users: TestUser[];
  familyGroups?: any[];
  testData: {
    accounts: any[];
    transactions: any[];
    budgets: any[];
    goals: any[];
  };
}

export class TestingService {
  private testUsers: TestUser[] = [];
  private testScenarios: TestScenario[] = [];

  constructor() {
    this.initializeTestScenarios();
  }

  /**
   * Создает тестовых пользователей для разных ролей
   */
  async createTestUsers(): Promise<TestUser[]> {
    console.log("🧪 Создание тестовых пользователей для разных ролей...");

    const testUserData: Array<{
      userData: InsertUser;
      credentials: { phone: string; password: string };
      role: string;
      planType: string;
    }> = [
      {
        userData: {
          email: "ivan.personal@test.ru",
          passwordHash: "", // будет заполнено
          firstName: "Иван",
          lastName: "Петров",
          phone: "+79161234567",
          role: "personal",
          planType: "free",
        },
        credentials: { phone: "+79161234567", password: "test123456" },
        role: "personal",
        planType: "free"
      },
      {
        userData: {
          email: "maria.premium@test.ru",
          passwordHash: "",
          firstName: "Мария",
          lastName: "Смирнова", 
          phone: "+79161234568",
          role: "personal",
          planType: "premium",
        },
        credentials: { phone: "+79161234568", password: "test123456" },
        role: "personal",
        planType: "premium"
      },
      {
        userData: {
          email: "alex.family@test.ru",
          passwordHash: "",
          firstName: "Александр",
          lastName: "Иванов",
          phone: "+79161234569",
          role: "family_admin",
          planType: "family",
        },
        credentials: { phone: "+79161234569", password: "test123456" },
        role: "family_admin",
        planType: "family"
      },
      {
        userData: {
          email: "elena.family@test.ru", 
          passwordHash: "",
          firstName: "Елена",
          lastName: "Иванова",
          phone: "+79161234570",
          role: "family_member",
          planType: "family",
        },
        credentials: { phone: "+79161234570", password: "test123456" },
        role: "family_member", 
        planType: "family"
      },
      {
        userData: {
          email: "business@test.ru",
          passwordHash: "",
          firstName: "Компания",
          lastName: "ООО Тест",
          phone: "+79161234571",
          role: "business",
          planType: "business",
        },
        credentials: { phone: "+79161234571", password: "test123456" },
        role: "business",
        planType: "business"
      }
    ];

    const createdUsers: TestUser[] = [];

    for (const testUser of testUserData) {
      try {
        // Регистрируем пользователя через authService
        const result = await authService.register(
          testUser.userData.firstName,
          testUser.userData.lastName,
          testUser.userData.phone,
          testUser.credentials.password,
          testUser.userData.email || undefined
        );

        createdUsers.push({
          user: result.user,
          credentials: testUser.credentials,
          role: testUser.role,
          planType: testUser.planType,
        });

        console.log(`✅ Создан ${testUser.role}: ${testUser.userData.firstName} ${testUser.userData.lastName}`);
      } catch (error) {
        console.warn(`⚠️ Пользователь ${testUser.userData.phone} уже существует или ошибка создания`);
        
        // Попробуем найти существующего пользователя
        try {
          const existingUser = await storage.getUserByPhone(testUser.userData.phone);
          if (existingUser) {
            createdUsers.push({
              user: existingUser,
              credentials: testUser.credentials,
              role: testUser.role,
              planType: testUser.planType,
            });
          }
        } catch (findError) {
          console.error(`❌ Не удалось найти пользователя ${testUser.userData.phone}`);
        }
      }
    }

    this.testUsers = createdUsers;
    return createdUsers;
  }

  /**
   * Создает семейную группу для тестирования
   */
  async createTestFamilyGroup(): Promise<any> {
    const familyAdmin = this.testUsers.find(u => u.role === "family_admin");
    const familyMember = this.testUsers.find(u => u.role === "family_member");

    if (!familyAdmin || !familyMember) {
      throw new Error("Нет пользователей для создания семейной группы");
    }

    const familyGroup: InsertFamilyGroup = {
      name: "Семья Ивановых",
      adminUserId: familyAdmin.user.id,
      inviteCode: "FAMILY123",
    };

    const group = await storage.createFamilyGroup(familyGroup);

    // Добавляем участника
    const memberData: InsertFamilyGroupMember = {
      groupId: group.id,
      userId: familyMember.user.id,
      role: "member",
      permissions: {
        canViewBudgets: true,
        canEditCategories: ["Продукты", "Транспорт"],
        monthlyLimit: 50000,
      },
    };

    await storage.addFamilyGroupMember(memberData);

    console.log("✅ Создана тестовая семейная группа");
    return group;
  }

  /**
   * Создает тестовые финансовые данные
   */
  async createTestFinancialData(userId: string, userRole: string): Promise<void> {
    console.log(`📊 Создание тестовых данных для ${userRole}...`);

    // Тестовые счета
    const accounts = [
      {
        userId,
        bankConnectionId: await this.createMockBankConnection(userId),
        externalAccountId: "test_acc_1",
        accountType: "checking",
        accountName: "Основной счет",
        balance: "150000.00",
        currency: "RUB",
      },
      {
        userId,
        bankConnectionId: await this.createMockBankConnection(userId),
        externalAccountId: "test_acc_2", 
        accountType: "savings",
        accountName: "Накопительный",
        balance: "75000.00",
        currency: "RUB",
      }
    ];

    for (const account of accounts) {
      await storage.createAccount(account);
    }

    // Тестовые транзакции
    const transactions = this.generateTestTransactions(userId, userRole);
    for (const transaction of transactions) {
      await storage.createTransaction({
        ...transaction,
        type: Number(transaction.amount) < 0 ? "expense" : "income",
        localDate: transaction.transactionDate.toISOString().slice(0, 10),
        amountRub: transaction.amount,
      });
    }

    // Тестовые цели
    const goals = [
      {
        userId,
        name: "Отпуск в Турции",
        description: "Семейный отдых на 2 недели",
        targetAmount: "200000.00",
        currentAmount: "85000.00",
        targetDate: new Date(2025, 6, 1),
      },
      {
        userId,
        name: "Новый автомобиль",
        description: "Замена старой машины",
        targetAmount: "1500000.00", 
        currentAmount: "450000.00",
        targetDate: new Date(2026, 0, 1),
      }
    ];

    for (const goal of goals) {
      await storage.createSavingsGoal(goal);
    }

    // Тестовые бюджеты
    const budgets = [
      {
        userId,
        category: "Продукты",
        monthlyLimit: "30000.00",
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      },
      {
        userId,
        category: "Транспорт", 
        monthlyLimit: "15000.00",
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      }
    ];

    for (const budget of budgets) {
      await storage.createBudget(budget);
    }

    console.log(`✅ Созданы тестовые данные для ${userRole}`);
  }

  /**
   * Запускает тест сценария для конкретной роли
   */
  async runRoleTest(role: string): Promise<{
    role: string;
    tests: Array<{
      name: string;
      status: "passed" | "failed" | "skipped";
      message?: string;
      data?: any;
    }>;
  }> {
    console.log(`🎯 Запуск тестов для роли: ${role}`);

    const user = this.testUsers.find(u => u.role === role);
    if (!user) {
      return {
        role,
        tests: [{
          name: "User Creation", 
          status: "failed",
          message: `Тестовый пользователь для роли ${role} не найден`
        }]
      };
    }

    const tests: Array<{
      name: string;
      status: "passed" | "failed" | "skipped";
      message?: string;
      data?: any;
    }> = [];

    // Тест аутентификации
    try {
      const loginResult = await authService.login(
        user.credentials.phone, 
        user.credentials.password
      );
      tests.push({
        name: "Authentication",
        status: "passed",
        data: { hasToken: !!loginResult.tokens.accessToken }
      });
    } catch (error) {
      tests.push({
        name: "Authentication",
        status: "failed",
        message: error instanceof Error ? error.message : "Ошибка аутентификации"
      });
    }

    // Тест доступа к счетам
    try {
      const accounts = await storage.getAccountsByUser(user.user.id);
      tests.push({
        name: "Account Access",
        status: "passed",
        data: { accountCount: accounts.length }
      });
    } catch (error) {
      tests.push({
        name: "Account Access",
        status: "failed",
        message: error instanceof Error ? error.message : "Ошибка доступа к счетам"
      });
    }

    // Тест доступа к транзакциям
    try {
      const transactions = await storage.getTransactionsByUser(user.user.id);
      tests.push({
        name: "Transaction Access", 
        status: "passed",
        data: { transactionCount: transactions.length }
      });
    } catch (error) {
      tests.push({
        name: "Transaction Access",
        status: "failed", 
        message: error instanceof Error ? error.message : "Ошибка доступа к транзакциям"
      });
    }

    // Тест специфичный для роли
    if (role === "family_admin") {
      try {
        const familyGroups = await storage.getFamilyGroupsByAdmin(user.user.id);
        tests.push({
          name: "Family Group Management",
          status: "passed",
          data: { groupCount: familyGroups.length }
        });
      } catch (error) {
        tests.push({
          name: "Family Group Management",
          status: "failed",
          message: error instanceof Error ? error.message : "Ошибка управления семейной группой"
        });
      }
    }

    return { role, tests };
  }

  /**
   * Запускает полный набор тестов для всех ролей
   */
  async runFullTestSuite(): Promise<{
    summary: {
      totalTests: number;
      passedTests: number;
      failedTests: number;
      skippedTests: number;
    };
    results: Array<{
      role: string;
      tests: Array<{
        name: string;
        status: "passed" | "failed" | "skipped";
        message?: string;
        data?: any;
      }>;
    }>;
  }> {
    console.log("🚀 Запуск полного набора тестов для всех ролей...");

    // Создаем тестовых пользователей
    await this.createTestUsers();

    // Создаем тестовую семейную группу
    try {
      await this.createTestFamilyGroup();
    } catch (error) {
      console.warn("⚠️ Не удалось создать семейную группу:", error);
    }

    // Создаем тестовые данные для каждого пользователя
    for (const testUser of this.testUsers) {
      try {
        await this.createTestFinancialData(testUser.user.id, testUser.role);
      } catch (error) {
        console.warn(`⚠️ Не удалось создать данные для ${testUser.role}:`, error);
      }
    }

    // Запускаем тесты для каждой роли
    const results = [];
    for (const role of ["personal", "family_admin", "family_member", "business"]) {
      const result = await this.runRoleTest(role);
      results.push(result);
    }

    // Подсчитываем статистику
    const summary = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      skippedTests: 0,
    };

    results.forEach(result => {
      result.tests.forEach(test => {
        summary.totalTests++;
        if (test.status === "passed") summary.passedTests++;
        else if (test.status === "failed") summary.failedTests++;
        else if (test.status === "skipped") summary.skippedTests++;
      });
    });

    console.log("✅ Тестирование завершено");
    console.log(`📊 Результаты: ${summary.passedTests}/${summary.totalTests} пройдено`);

    return { summary, results };
  }

  /**
   * Очищает тестовые данные
   */
  async cleanupTestData(): Promise<void> {
    console.log("🧹 Очистка тестовых данных...");

    for (const testUser of this.testUsers) {
      try {
        await storage.deleteUserData(testUser.user.id);
        console.log(`✅ Удалены данные пользователя ${testUser.user.firstName}`);
      } catch (error) {
        console.warn(`⚠️ Ошибка удаления данных пользователя ${testUser.user.id}`);
      }
    }

    this.testUsers = [];
    console.log("✅ Тестовые данные очищены");
  }

  private initializeTestScenarios(): void {
    // Инициализация тестовых сценариев
    this.testScenarios = [
      {
        name: "Personal User Basic Flow",
        description: "Основной поток для личного пользователя",
        users: [],
        testData: {
          accounts: [],
          transactions: [],
          budgets: [],
          goals: []
        }
      },
      {
        name: "Family Plan Management",
        description: "Управление семейным планом",
        users: [],
        familyGroups: [],
        testData: {
          accounts: [],
          transactions: [],
          budgets: [],
          goals: []
        }
      }
    ];
  }

  private async createMockBankConnection(userId: string): Promise<string> {
    const bankConnection = await storage.createBankConnection({
      userId,
      bankCode: "test_bank",
      bankName: "Тестовый банк",
      accessToken: "encrypted_test_token",
      status: "active",
    });
    return bankConnection.id;
  }

  private generateTestTransactions(userId: string, userRole: string) {
    const baseTransactions = [
      {
        userId,
        accountId: "", // будет заполнено
        amount: "-2500.00",
        description: "Покупка в Пятерочке",
        merchant: "Пятерочка",
        category: "Продукты",
        transactionDate: new Date(2025, 0, 15),
      },
      {
        userId,
        accountId: "",
        amount: "-850.00", 
        description: "Проезд в метро",
        merchant: "Московский метрополитен",
        category: "Транспорт",
        transactionDate: new Date(2025, 0, 14),
      },
      {
        userId,
        accountId: "",
        amount: "+75000.00",
        description: "Зарплата",
        category: "Доходы",
        transactionDate: new Date(2025, 0, 10),
      }
    ];

    if (userRole === "business") {
      baseTransactions.push(
        {
          userId,
          accountId: "",
          amount: "-45000.00",
          description: "Офисная аренда",
          category: "Бизнес расходы",
          transactionDate: new Date(2025, 0, 1),
        },
        {
          userId,
          accountId: "",
          amount: "+350000.00",
          description: "Поступление от клиента",
          category: "Выручка",
          transactionDate: new Date(2025, 0, 12),
        }
      );
    }

    return baseTransactions;
  }
}

export const testingService = new TestingService();