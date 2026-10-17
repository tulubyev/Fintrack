import { apiRequest } from "./queryClient";
import type { AiChatSession } from "../types";

// AI API
export const aiAPI = {
  createChatSession: async (): Promise<AiChatSession> => {
    const res = await apiRequest("POST", "/api/ai/chat/session");
    return await res.json();
  },

  sendMessage: async (sessionId: string, message: string): Promise<{ reply: string }> => {
    const res = await apiRequest("POST", "/api/ai/chat/message", { sessionId, message });
    return await res.json();
  },

  getInsights: async (): Promise<{ insights: string }> => {
    const res = await apiRequest("GET", "/api/ai/insights");
    return await res.json();
  },

  getChatSessions: async (): Promise<AiChatSession[]> => {
    const res = await apiRequest("GET", "/api/ai/chat/sessions");
    return await res.json();
  },

  getBalance: async (): Promise<{ balance: number; balanceFormatted: string; status: string }> => {
    const res = await apiRequest("GET", "/api/ai/balance");
    return await res.json();
  },
};
