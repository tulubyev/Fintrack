import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { aiAPI } from "../../lib/api";
import { Bot, MessageCircle, Sparkles } from "lucide-react";
import AIChatModal from "../modals/AIChatModal";

export default function AIAssistant() {
  const [showChatModal, setShowChatModal] = useState(false);
  const [chatSessionId, setChatSessionId] = useState<string>();

  const { data: insights, isLoading, error } = useQuery({
    queryKey: ["/api/ai/insights"],
    queryFn: () => aiAPI.getInsights(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const handleOpenChat = async () => {
    try {
      const session = await aiAPI.createChatSession();
      setChatSessionId(session.sessionId);
      setShowChatModal(true);
    } catch (error) {
      console.error('Failed to create chat session:', error);
      // Fallback: open modal without session ID
      setShowChatModal(true);
    }
  };

  return (
    <>
      <div className="bg-gradient-to-br from-primary/5 to-accent/5 p-6 rounded-xl border border-border">
        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">AI Помощник</h3>
            <p className="text-sm text-muted-foreground">Персональные рекомендации</p>
          </div>
        </div>
        
        <div className="bg-card p-4 rounded-lg mb-4 border border-border/50">
          <div className="flex items-start gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <p className="text-sm font-medium text-foreground">Совет дня:</p>
          </div>
          
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : error ? (
            <p className="text-sm text-muted-foreground">
              Не удалось загрузить рекомендации. Попробуйте позже.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="ai-insight">
              {insights?.insights || "Проанализируйте ваши финансы для получения персональных рекомендаций."}
            </p>
          )}
        </div>
        
        <Button 
          onClick={handleOpenChat}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
          data-testid="button-open-ai-chat"
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          Открыть чат с ИИ
        </Button>
      </div>

      <AIChatModal 
        isOpen={showChatModal}
        onClose={() => setShowChatModal(false)}
        sessionId={chatSessionId}
      />
    </>
  );
}
