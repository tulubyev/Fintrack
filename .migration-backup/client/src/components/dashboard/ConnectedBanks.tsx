import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { bankAPI } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Building2, MoreVertical, CheckCircle, AlertCircle, XCircle, Settings } from "lucide-react";
import BankConnectionModal from "../modals/BankConnectionModal";

export default function ConnectedBanks() {
  const { toast } = useToast();
  const [showBankModal, setShowBankModal] = useState(false);

  const { data: connections, isLoading, error } = useQuery({
    queryKey: ["/api/banks/connections"],
    queryFn: () => bankAPI.getConnections(),
  });

  const disconnectMutation = useMutation({
    mutationFn: bankAPI.disconnectBank,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/banks/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Банк отключен",
        description: "Подключение к банку успешно удалено",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка отключения",
        description: error instanceof Error ? error.message : "Произошла ошибка",
        variant: "destructive",
      });
    },
  });

  const getBankLogo = (bankCode: string) => {
    const logos: { [key: string]: string } = {
      'sberbank': '🟢',
      'vtb': '🔵', 
      'tinkoff': '🟡',
      'alfabank': '🔴',
      'gazprombank': '⚫',
    };
    return logos[bankCode] || '🏦';
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'active':
        return {
          icon: CheckCircle,
          color: 'text-success',
          dotColor: 'bg-success',
          label: 'Активно',
        };
      case 'expired':
        return {
          icon: AlertCircle,
          color: 'text-warning',
          dotColor: 'bg-warning',
          label: 'Требует обновления',
        };
      case 'revoked':
        return {
          icon: XCircle,
          color: 'text-destructive', 
          dotColor: 'bg-destructive',
          label: 'Отключено',
        };
      case 'pending':
        return {
          icon: AlertCircle,
          color: 'text-warning',
          dotColor: 'bg-warning',
          label: 'Ожидает подтверждения',
        };
      default:
        return {
          icon: AlertCircle,
          color: 'text-muted-foreground',
          dotColor: 'bg-muted-foreground',
          label: 'Неизвестно',
        };
    }
  };

  const formatLastSync = (lastSyncAt?: string) => {
    if (!lastSyncAt) return 'Никогда';
    
    const date = new Date(lastSyncAt);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Только что';
    if (diffMinutes < 60) return `${diffMinutes} мин назад`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} ч назад`;
    return `${Math.floor(diffMinutes / 1440)} дн назад`;
  };

  const handleConnectBank = async (bankCode: string) => {
    try {
      const result = await bankAPI.initiateConnection(bankCode);
      // In a real app, redirect to bank's OAuth page
      // For MVP, simulate immediate success
      toast({
        title: "Банк подключается",
        description: `Инициируется подключение к ${bankCode}`,
      });
      
      // Simulate OAuth callback after 2 seconds
      setTimeout(async () => {
        try {
          await bankAPI.handleOAuthCallback(result.consentId, `auth_code_${Date.now()}`);
          queryClient.invalidateQueries({ queryKey: ["/api/banks/connections"] });
          toast({
            title: "Банк подключен",
            description: "Подключение успешно установлено",
          });
        } catch (error) {
          toast({
            title: "Ошибка подключения",
            description: "Не удалось завершить подключение",
            variant: "destructive",
          });
        }
      }, 2000);
      
    } catch (error) {
      toast({
        title: "Ошибка подключения",
        description: error instanceof Error ? error.message : "Произошла ошибка",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Подключенные банки
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              className="text-primary hover:text-primary/80"
              onClick={() => setShowBankModal(true)}
              data-testid="button-manage-banks"
            >
              <Settings className="h-4 w-4 mr-1" />
              Управление
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="w-2 h-2 rounded-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-4">
              <p className="text-destructive">Ошибка загрузки банков</p>
            </div>
          ) : !connections || connections.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                <Building2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Банки не подключены</p>
              <p className="text-xs text-muted-foreground mt-1">
                Подключите банковские счета для анализа финансов
              </p>
              <Button 
                onClick={() => setShowBankModal(true)}
                className="mt-3"
                size="sm"
                data-testid="button-connect-first-bank"
              >
                Подключить банк
              </Button>
            </div>
          ) : (
            <div className="space-y-3" data-testid="connected-banks">
              {connections.map((connection) => {
                const statusInfo = getStatusInfo(connection.status);
                const StatusIcon = statusInfo.icon;
                
                return (
                  <div 
                    key={connection.id} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors"
                    data-testid={`bank-${connection.bankCode}`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        <span className="text-lg">{getBankLogo(connection.bankCode)}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground" data-testid={`bank-name-${connection.id}`}>
                            {connection.bankName}
                          </p>
                          <Badge 
                            variant={connection.status === 'active' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {statusInfo.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground" data-testid={`bank-sync-${connection.id}`}>
                          Синхронизация: {formatLastSync(connection.lastSyncAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full ${statusInfo.dotColor}`} />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" data-testid={`bank-menu-${connection.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => disconnectMutation.mutate(connection.id)}
                            className="text-destructive"
                            data-testid={`disconnect-${connection.id}`}
                          >
                            Отключить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <BankConnectionModal 
        isOpen={showBankModal}
        onClose={() => setShowBankModal(false)}
        onConnect={handleConnectBank}
      />
    </>
  );
}
