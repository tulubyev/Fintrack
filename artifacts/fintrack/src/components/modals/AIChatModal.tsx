import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { aiAPI } from "../../lib/api";
import { useToast } from "@/hooks/use-toast";
import { Bot, User, Send, X, Sparkles } from "lucide-react";
import type { AIChatModalProps, ChatMessage } from "../../types";

export default function AIChatModal({ isOpen, onClose, sessionId }: AIChatModalProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(sessionId);
  const [balance, setBalance] = useState<{ balance: number; balanceFormatted: string; status: string } | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Initialize chat session if not provided
  useEffect(() => {
    if (isOpen && !currentSessionId) {
      Promise.all([
        aiAPI.createChatSession(),
        // Баланс ключа видят только администраторы; остальным чат открывается без него
        aiAPI.getBalance().catch(() => null)
      ])
        .then(([session, balanceData]) => {
          setCurrentSessionId(session.sessionId);
          setMessages(session.messages || []);
          setBalance(balanceData);
        })
        .catch((error) => {
          console.error('Failed to create chat session:', error);
          toast({
            title: "Ошибка создания чата",
            description: "Не удалось создать сессию чата",
            variant: "destructive",
          });
        });
    }
  }, [isOpen, currentSessionId, toast]);

  // Reset when sessionId prop changes
  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId) {
      setCurrentSessionId(sessionId);
      setMessages([]);
    }
  }, [sessionId, currentSessionId]);

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  const sendMessageMutation = useMutation({
    mutationFn: ({ sessionId, message }: { sessionId: string; message: string }) =>
      aiAPI.sendMessage(sessionId, message),
    onSuccess: (response, variables) => {
      // Add user message
      const userMessage: ChatMessage = {
        role: 'user',
        content: variables.message,
        timestamp: new Date(),
      };
      
      // Add AI response
      const aiMessage: ChatMessage = {
        role: 'assistant',
        content: response.reply,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, userMessage, aiMessage]);
      setInputMessage("");
    },
    onError: (error) => {
      toast({
        title: "Ошибка отправки сообщения",
        description: error instanceof Error ? error.message : "Произошла ошибка",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputMessage.trim() || !currentSessionId || sendMessageMutation.isPending) {
      return;
    }

    if (balance && balance.status === 'critical') {
      toast({
        title: "Недостаточно средств",
        description: "На вашем аккаунте OpenRouter недостаточно средств для использования AI",
        variant: "destructive",
      });
      return;
    }

    sendMessageMutation.mutate({
      sessionId: currentSessionId,
      message: inputMessage.trim(),
    });
  };

  const handleClose = () => {
    setMessages([]);
    setInputMessage("");
    setCurrentSessionId(undefined);
    onClose();
  };

  const formatTime = (timestamp: Date) => {
    return new Date(timestamp).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl h-[600px] flex flex-col p-0">
        <DialogHeader className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <DialogTitle className="font-semibold">Финансовый AI Помощник</DialogTitle>
                <DialogDescription>
                  Готов помочь с анализом ваших финансов
                </DialogDescription>
                {balance && (
                  <div className={`text-xs mt-2 ${
                    balance.status === 'critical' ? 'text-red-600' : 
                    balance.status === 'low' ? 'text-yellow-600' : 
                    'text-green-600'
                  }`}>
                    💰 Баланс OpenRouter: {balance.balanceFormatted}
                    {balance.status === 'critical' && ' ⚠️ Недостаточно средств'}
                    {balance.status === 'low' && ' ⚠️ Низкий баланс'}
                  </div>
                )}
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={handleClose}
              data-testid="button-close-chat"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1 p-6" ref={scrollAreaRef} data-testid="chat-messages">
          <div className="space-y-4">
            {!currentSessionId ? (
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="flex space-x-3">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <p className="text-muted-foreground">Начните разговор с AI помощником</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Задайте вопрос о ваших финансах
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <div 
                  key={index} 
                  className={`flex space-x-3 ${message.role === 'user' ? 'justify-end' : ''}`}
                  data-testid={`message-${message.role}-${index}`}
                >
                  {message.role === 'assistant' && (
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                      <Bot className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                  
                  <div className={`flex-1 ${message.role === 'user' ? 'max-w-xs' : ''}`}>
                    <div 
                      className={`p-3 rounded-lg ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground ml-auto'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 text-right">
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="w-8 h-8 bg-secondary rounded-lg flex items-center justify-center flex-shrink-0">
                      <User className="h-4 w-4 text-secondary-foreground" />
                    </div>
                  )}
                </div>
              ))
            )}
            
            {sendMessageMutation.isPending && (
              <div className="flex space-x-3">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <Bot className="h-4 w-4 text-primary-foreground" />
                </div>
                <div className="bg-muted p-3 rounded-lg flex-1">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="p-6 border-t border-border">
          <form onSubmit={handleSendMessage} className="flex space-x-3">
            <Input
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Напишите ваш вопрос..."
              disabled={!currentSessionId || sendMessageMutation.isPending}
              className="flex-1"
              data-testid="input-chat-message"
            />
            <Button 
              type="submit"
              disabled={!inputMessage.trim() || !currentSessionId || sendMessageMutation.isPending}
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          
          <div className="mt-2 text-xs text-muted-foreground">
            💡 <strong>Попробуйте спросить:</strong> "Как сэкономить на продуктах?" или "Проанализируй мои траты"
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
