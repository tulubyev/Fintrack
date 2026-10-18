import OpenAI from "openai";
import { storage } from "../storage";
import type { InsertAiChatSession, AiChatSession, SavingsGoal } from "@shared/schema";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface FinancialContext {
  totalBalance: string;
  monthlyIncome: string;
  monthlyExpenses: string;
  topCategories: Array<{ category: string; total: string }>;
  savingsGoals: Array<{ name: string; progress: number }>;
}

/** LLM не настроен или не ответил: показываем это честно, без выдуманных советов. */
export class AiUnavailableError extends Error {
  constructor() {
    super("AI-помощник временно недоступен");
  }
}

/** Сессии нет у этого пользователя — своей или вообще: чужую не отличаем от несуществующей. */
export class ChatSessionNotFoundError extends Error {
  constructor() {
    super("Сессия чата не найдена");
  }
}

export class AIService {
  private openai: OpenAI;

  constructor() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn("⚠️  OPENROUTER_API_KEY не найден, AI-помощник недоступен");
      this.openai = null as any;
    } else {
      this.openai = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: apiKey,
        defaultHeaders: {
          "HTTP-Referer": process.env.BASE_URL || "https://fin-wall.ru",
          "X-Title": "FinTrack AI Assistant",
        },
      });
    }
  }

  async createChatSession(userId: string): Promise<AiChatSession> {
    const sessionId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const initialMessages: ChatMessage[] = [
      {
        role: "system",
        content: this.getSystemPrompt(),
        timestamp: new Date(),
      },
      {
        role: "assistant",
        content: "Привет! Я ваш персональный финансовый помощник FinTrack. Могу помочь проанализировать расходы, дать советы по накоплениям или ответить на вопросы о ваших финансах. О чём хотите поговорить?",
        timestamp: new Date(),
      },
    ];

    const session = await storage.createAiChatSession({
      userId,
      sessionId,
      messages: initialMessages,
    });

    return session;
  }

  async sendMessage(userId: string, sessionId: string, message: string): Promise<string> {
    // Get existing session
    const sessions = await storage.getAiChatSessions(userId);
    const session = sessions.find(s => s.sessionId === sessionId);
    
    if (!session) {
      throw new ChatSessionNotFoundError();
    }

    // Get user's financial context
    const context = await this.getFinancialContext(userId);

    // Prepare messages for OpenAI
    const messages = session.messages as ChatMessage[];
    
    // Add user message
    messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });

    // Prepare OpenAI request with context
    const openAIMessages = [
      {
        role: "system" as const,
        content: this.getSystemPromptWithContext(context),
      },
      ...messages.slice(-10).map(msg => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ];

    let assistantReply: string;

    if (!this.openai) {
      throw new AiUnavailableError();
    } else {
      try {
        // Using Claude 3.5 Sonnet via OpenRouter for financial analysis
        const completion = await this.openai.chat.completions.create({
          model: "anthropic/claude-3.5-sonnet",
          messages: openAIMessages,
          max_tokens: 500,
          temperature: 0.7,
        });

        assistantReply = completion.choices[0]?.message?.content || "Извините, произошла ошибка. Попробуйте еще раз.";
      } catch (error) {
        console.error("OpenAI API error:", error);
        throw new AiUnavailableError();
      }
    }

    // Add assistant response
    messages.push({
      role: "assistant",
      content: assistantReply,
      timestamp: new Date(),
    });

    // Update session
    await storage.updateAiChatSession(session.id, {
      messages: messages,
    });

    return assistantReply;
  }

  async getFinancialInsights(userId: string): Promise<string> {
    const context = await this.getFinancialContext(userId);
    
    const prompt = `
    Проанализируйте финансовую ситуацию пользователя и дайте 3-4 конкретных совета:
    
    Общий баланс: ${context.totalBalance} ₽
    Месячный доход: ${context.monthlyIncome} ₽
    Месячные расходы: ${context.monthlyExpenses} ₽
    
    Топ категории трат:
    ${context.topCategories.map(cat => `- ${cat.category}: ${cat.total} ₽`).join('\n')}
    
    Финансовые цели:
    ${context.savingsGoals.map(goal => `- ${goal.name}: ${goal.progress}% выполнено`).join('\n')}
    
    Дайте практические советы на русском языке.
    `;

    if (!this.openai) {
      throw new AiUnavailableError();
    }

    try {
      // Using Claude 3.5 Sonnet via OpenRouter for financial insights
      const completion = await this.openai.chat.completions.create({
        model: "anthropic/claude-3.5-sonnet",
        messages: [
          {
            role: "system",
            content: "Вы финансовый консультант. Давайте конкретные, практичные советы на русском языке.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 600,
        temperature: 0.7,
      });

      return completion.choices[0]?.message?.content || "Не удалось получить рекомендации.";
    } catch (error) {
      console.error("OpenAI API error:", error);
      throw new AiUnavailableError();
    }
  }

  private async getFinancialContext(userId: string): Promise<FinancialContext> {
    try {
      const now = new Date();
      const [totalBalance, savingsGoals, cashFlow] = await Promise.all([
        storage.getTotalBalance(userId),
        storage.getSavingsGoals(userId),
        storage.getCashFlow(userId, new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)),
      ]);

      return {
        totalBalance: totalBalance || "0",
        monthlyIncome: cashFlow.income,
        monthlyExpenses: cashFlow.expenses,
        topCategories: [],
        savingsGoals: savingsGoals.map((goal: SavingsGoal) => ({
          name: goal.name,
          progress: Math.round((parseFloat(goal.currentAmount || '0') / parseFloat(goal.targetAmount)) * 100),
        })),
      };
    } catch (error) {
      console.error('Error getting financial context:', error);
      return {
        totalBalance: "0",
        monthlyIncome: "0",
        monthlyExpenses: "0",
        topCategories: [],
        savingsGoals: [],
      };
    }
  }

  private getSystemPrompt(): string {
    return `
    Вы - персональный финансовый помощник FinTrack. Вы помогаете пользователям управлять финансами на русском языке.
    
    Ваши возможности:
    - Анализ трат и доходов
    - Советы по бюджетированию
    - Рекомендации по накоплениям
    - Помощь в планировании финансовых целей
    - Объяснение финансовых концепций простым языком
    
    Правила общения:
    - Всегда отвечайте на русском языке
    - Будьте дружелюбны и понятны
    - Давайте конкретные, практичные советы
    - Учитывайте российские реалии (рубли, российские банки)
    - Если не можете дать точный ответ, честно об этом скажите
    - Не давайте юридических или инвестиционных советов без оговорок
    `;
  }

  private getSystemPromptWithContext(context: FinancialContext): string {
    return `
    ${this.getSystemPrompt()}
    
    Текущая финансовая ситуация пользователя:
    - Общий баланс: ${context.totalBalance} ₽
    - Месячный доход: ${context.monthlyIncome} ₽  
    - Месячные расходы: ${context.monthlyExpenses} ₽
    - Основные категории трат: ${context.topCategories.map(cat => cat.category).join(', ')}
    - Активных финансовых целей: ${context.savingsGoals.length}
    
    Используйте эту информацию для персонализированных советов.
    `;
  }

  async getOpenRouterBalance(): Promise<{ balance: number; balanceFormatted: string; status: string }> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn('⚠️  No OPENROUTER_API_KEY found');
      return {
        balance: 0,
        balanceFormatted: "$0.00",
        status: "no_key"
      };
    }

    try {
      console.log('🔍 Fetching OpenRouter balance...');
      const response = await fetch('https://openrouter.ai/api/v1/auth/key/info', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      console.log(`📡 Balance API response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ OpenRouter API error:', response.status, errorText.substring(0, 200));
        return {
          balance: 0,
          balanceFormatted: "$0.00",
          status: "error"
        };
      }

      const data = (await response.json()) as any;
      console.log('📊 Balance data received:', JSON.stringify(data).substring(0, 500));
      
      const balance = data.data?.balance || data.balance || 0;
      const balanceFormatted = `$${balance.toFixed(2)}`;
      const status = balance > 5 ? "ok" : balance > 1 ? "low" : balance > 0 ? "critical" : "no_balance";

      console.log(`✅ Balance fetched successfully: ${balanceFormatted} (status: ${status})`);

      return {
        balance,
        balanceFormatted,
        status
      };
    } catch (error) {
      console.error('❌ Failed to fetch OpenRouter balance:', error instanceof Error ? error.message : String(error));
      return {
        balance: 0,
        balanceFormatted: "$0.00",
        status: "error"
      };
    }
  }
}

export const aiService = new AIService();
