import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { aiService } from '../services/aiService.js';
import { storage } from '../storage';
import { config } from '../../config/environment';
import type { AuthenticatedRequest } from '../middleware/types.js';

const router = Router();

/**
 * AI ASSISTANT ROUTES MODULE
 * Extracted from main routes.ts for modular architecture
 * 
 * Routes:
 * - POST /chat/session - Create new AI chat session
 * - POST /chat/message - Send message to AI assistant
 * - GET /insights - Get financial insights from AI
 * - GET /chat/sessions - Get user's chat sessions
 * - POST /chat - Direct chat with AI assistant (Claude 3.5 Sonnet)
 */

// Create new AI chat session
router.post('/chat/session', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    console.log(`📝 Creating AI chat session for user: ${req.user!.id}`);
    const session = await aiService.createChatSession(req.user!.id);
    console.log(`✅ AI chat session created:`, session);
    res.json(session);
  } catch (error) {
    console.error('❌ Error creating chat session:', error);
    res.status(500).json({ message: 'Ошибка создания сессии чата' });
  }
});

// Send message to AI assistant
router.post('/chat/message', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId, message } = req.body;
    console.log(`💬 AI message from user ${req.user!.id}:`, message);
    if (!sessionId || !message) {
      return res.status(400).json({ message: 'SessionId и сообщение обязательны' });
    }

    const reply = await aiService.sendMessage(req.user!.id, sessionId, message);
    console.log(`🤖 AI reply:`, reply);
    res.json({ reply });
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(400).json({ message: error instanceof Error ? error.message : 'Ошибка обработки сообщения' });
  }
});

// Get financial insights from AI
router.get('/insights', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const insights = await aiService.getFinancialInsights(req.user!.id);
    res.json({ insights });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения финансовых рекомендаций' });
  }
});

// Get user's chat sessions
router.get('/chat/sessions', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const sessions = await storage.getAiChatSessions(req.user!.id);
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения сессий чата' });
  }
});

// Get OpenRouter balance
router.get('/balance', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const balance = await aiService.getOpenRouterBalance();
    res.json(balance);
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({ 
      balance: 0,
      balanceFormatted: "$0.00",
      status: "error"
    });
  }
});

// Direct chat with AI assistant (Claude 3.5 Sonnet via OpenRouter)
router.post('/chat', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, context = [] } = req.body;
    
    if (!process.env.OPENROUTER_API_KEY) {
      return res.status(503).json({ 
        message: 'AI сервис временно недоступен - отсутствует API ключ' 
      });
    }

    // Формируем контекст для AI
    const systemPrompt = `Ты - умный помощник для российских пользователей приложения FinTrack. 

Твоя основная специализация:
- Финансовое консультирование и планирование
- Анализ личных финансов, бюджетирование
- Практические советы по инвестициям (российский рынок)
- Объяснение финансовых терминов простым языком
- Помощь в оптимизации расходов и доходов
- Консультирование по банковским продуктам в России

Дополнительные возможности:
- Общие вопросы и поддержка беседы
- Помощь с планированием и организацией
- Советы по карьере и образованию
- Обсуждение технологий и трендов
- Ответы на любые познавательные вопросы

Принципы работы:
- Отвечай на русском языке
- Будь дружелюбным, понимающим и профессиональным
- Давай конкретные и практичные советы
- Для финансовых советов учитывай российские реалии
- При инвестиционных советах предупреждай о рисках
- Если не знаешь ответ, честно скажи об этом
- Поддерживай естественную беседу на любые темы

Если речь о финансах, но у тебя нет конкретных данных пользователя, предложи получить аналитику в приложении.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...context.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'FinTrack AI Assistant'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: messages,
        max_tokens: config.ai.maxTokens,
        temperature: config.ai.temperature,
        top_p: config.ai.topP,
        frequency_penalty: 0,
        presence_penalty: 0
      })
    });

    if (!response.ok) {
      console.error('OpenRouter API error:', response.status, await response.text());
      return res.status(500).json({ 
        message: 'Ошибка AI сервиса. Попробуйте позже.' 
      });
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content || 'Извините, не смог обработать ваш запрос.';

    res.json({ response: aiResponse });
  } catch (error) {
    console.error('AI Chat error:', error);
    res.status(500).json({ 
      message: 'Произошла ошибка при обработке запроса' 
    });
  }
});

export default router;