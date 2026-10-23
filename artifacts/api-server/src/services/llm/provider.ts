/**
 * Клиент нейросети (решение D2): RouterAI (routerai.ru) — российский шлюз с OpenAI-совместимым API. Адрес, ключ и
 * модели — в .env: LLM_BASE_URL, LLM_API_KEY, LLM_CATEGORIZATION_MODEL (советник E2.4 добавит свою модель).
 * Один интерфейс для категоризации и советника; в тестах подменяется через setLlmProvider.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** Строгий JSON-ответ по схеме (response_format: json_schema). */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  timeoutMs?: number;
}

export interface ChatResult {
  content: string;
  model: string;
  totalTokens: number | null;
}

export interface LlmProvider {
  name: string;
  chat(request: ChatRequest): Promise<ChatResult>;
}

export class LlmError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
  }
}

/** OpenAI-совместимый /chat/completions. */
export function openAiCompatibleProvider(name: string, baseUrl: string, apiKey: string): LlmProvider {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return {
    name,
    async chat({ model, messages, temperature = 0, jsonSchema, timeoutMs = 30_000 }) {
      const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          ...(jsonSchema ? { response_format: { type: "json_schema", json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema } } } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        // тело ошибки провайдера не логируем целиком: в нём может оказаться запрос
        throw new LlmError(`${name}: HTTP ${response.status}`, response.status);
      }
      const body = await response.json() as { model?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { total_tokens?: number } };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new LlmError(`${name}: пустой ответ`);
      return { content, model: body.model ?? model, totalTokens: body.usage?.total_tokens ?? null };
    },
  };
}

let override: LlmProvider | null | undefined;

/** Провайдер из .env или null, если адрес или ключ не заданы. */
export function llmProvider(): LlmProvider | null {
  if (override !== undefined) return override;
  const baseUrl = process.env.LLM_BASE_URL?.trim();
  const apiKey = process.env.LLM_API_KEY?.trim();
  return baseUrl && apiKey ? openAiCompatibleProvider("routerai", baseUrl, apiKey) : null;
}

/** Подменяет провайдера (тесты); undefined возвращает провайдера из .env. */
export function setLlmProvider(provider: LlmProvider | null | undefined) {
  override = provider;
}
