import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Shield, ShieldCheck, Copy, RefreshCw, Key, Smartphone, QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TwoFactorStatus {
  enabled: boolean;
}

interface TwoFactorSetupData {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
  manualEntryKey: string;
}

export function TwoFactorSetup() {
  const { toast } = useToast();
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupData, setSetupData] = useState<TwoFactorSetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  // Получаем статус 2FA
  const { data: status, isLoading } = useQuery<TwoFactorStatus>({
    queryKey: ['/api/auth/2fa/status'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/auth/2fa/status');
      return res.json();
    },
  });

  // Начальная настройка 2FA
  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/auth/2fa/setup');
      return res.json();
    },
    onSuccess: (data: TwoFactorSetupData) => {
      setSetupData(data);
      setIsSettingUp(true);
      toast({
        title: "Настройка 2FA",
        description: "Отсканируйте QR-код в приложении аутентификатора",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось начать настройку 2FA",
        variant: "destructive",
      });
    },
  });

  // Включение 2FA
  const enableMutation = useMutation({
    mutationFn: async () => {
      if (!setupData || !verificationCode) {
        throw new Error("Введите код подтверждения");
      }
      
      const res = await apiRequest('POST', '/api/auth/2fa/enable', {
        secret: setupData.secret,
        verificationCode,
        backupCodes: setupData.backupCodes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/2fa/status'] });
      setIsSettingUp(false);
      setSetupData(null);
      setVerificationCode('');
      setShowBackupCodes(true);
      toast({
        title: "2FA включена",
        description: "Двухфакторная аутентификация успешно активирована",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось включить 2FA",
        variant: "destructive",
      });
    },
  });

  // Отключение 2FA
  const disableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/auth/2fa/disable', {
        code: disableCode,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/2fa/status'] });
      setDisableCode('');
      setShowBackupCodes(false);
      toast({
        title: "2FA отключена",
        description: "Двухфакторная аутентификация деактивирована",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось отключить 2FA",
        variant: "destructive",
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Скопировано",
      description: "Текст скопирован в буфер обмена",
    });
  };

  const cancelSetup = () => {
    setIsSettingUp(false);
    setSetupData(null);
    setVerificationCode('');
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <RefreshCw className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status?.enabled ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <Shield className="h-5 w-5 text-gray-500" />
            )}
            Двухфакторная аутентификация (2FA)
          </CardTitle>
          <CardDescription>
            Повысьте безопасность своего аккаунта с помощью дополнительного уровня защиты
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Статус 2FA */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Статус 2FA</p>
              <p className="text-sm text-muted-foreground">
                {status?.enabled 
                  ? "Двухфакторная аутентификация активна" 
                  : "Двухфакторная аутентификация отключена"
                }
              </p>
            </div>
            <Badge variant={status?.enabled ? "default" : "secondary"}>
              {status?.enabled ? "Включена" : "Отключена"}
            </Badge>
          </div>

          <Separator />

          {/* Настройка 2FA */}
          {!status?.enabled && !isSettingUp && (
            <div className="space-y-4">
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Рекомендуем включить 2FA для защиты вашего финансового аккаунта.
                  Поддерживаются приложения: Google Authenticator, Yandex.Key, Microsoft Authenticator и другие.
                </AlertDescription>
              </Alert>
              
              <Button 
                onClick={() => setupMutation.mutate()} 
                disabled={setupMutation.isPending}
                className="w-full"
              >
                {setupMutation.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                <QrCode className="mr-2 h-4 w-4" />
                Настроить 2FA
              </Button>
            </div>
          )}

          {/* Процесс настройки */}
          {isSettingUp && setupData && (
            <div className="space-y-6">
              <Alert>
                <Key className="h-4 w-4" />
                <AlertDescription>
                  Отсканируйте QR-код в приложении аутентификатора или введите ключ вручную
                </AlertDescription>
              </Alert>

              {/* QR-код */}
              <div className="text-center space-y-4">
                <div className="flex justify-center">
                  <img 
                    src={setupData.qrCodeUrl} 
                    alt="QR код для настройки 2FA" 
                    className="border rounded-lg"
                  />
                </div>
                
                {/* Ручной ввод */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Ключ для ручного ввода:</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all">
                      {setupData.manualEntryKey}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(setupData.manualEntryKey)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Подтверждение */}
              <div className="space-y-3">
                <Label htmlFor="verification-code">Введите код из приложения:</Label>
                <Input
                  id="verification-code"
                  type="text"
                  placeholder="000000"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-lg tracking-widest font-mono"
                />
                
                <div className="flex gap-3">
                  <Button
                    onClick={() => enableMutation.mutate()}
                    disabled={enableMutation.isPending || verificationCode.length !== 6}
                    className="flex-1"
                  >
                    {enableMutation.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Включить 2FA
                  </Button>
                  <Button
                    variant="outline"
                    onClick={cancelSetup}
                    disabled={enableMutation.isPending}
                  >
                    Отмена
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Отключение 2FA */}
          {status?.enabled && (
            <div className="space-y-4">
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertDescription>
                  2FA активна. Для отключения введите код из приложения аутентификатора.
                </AlertDescription>
              </Alert>
              
              <div className="space-y-3">
                <Label htmlFor="disable-code">Код для отключения 2FA:</Label>
                <Input
                  id="disable-code"
                  type="text"
                  placeholder="000000"
                  maxLength={6}
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-lg tracking-widest font-mono"
                />
                
                <Button
                  onClick={() => disableMutation.mutate()}
                  disabled={disableMutation.isPending || disableCode.length !== 6}
                  variant="destructive"
                  className="w-full"
                >
                  {disableMutation.isPending && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
                  Отключить 2FA
                </Button>
              </div>
            </div>
          )}

          {/* Резервные коды */}
          {showBackupCodes && setupData && (
            <div className="space-y-4">
              <Separator />
              <Alert>
                <Key className="h-4 w-4" />
                <AlertDescription>
                  Сохраните эти резервные коды в безопасном месте. Они помогут восстановить доступ при потере устройства.
                </AlertDescription>
              </Alert>
              
              <div className="grid grid-cols-2 gap-2">
                {setupData.backupCodes.map((code, index) => (
                  <code 
                    key={index}
                    className="p-2 bg-muted rounded text-sm font-mono text-center"
                  >
                    {code}
                  </code>
                ))}
              </div>
              
              <Button
                variant="outline"
                onClick={() => copyToClipboard(setupData.backupCodes.join('\n'))}
                className="w-full"
              >
                <Copy className="mr-2 h-4 w-4" />
                Скопировать все коды
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SMS аутентификация */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            SMS-аутентификация
          </CardTitle>
          <CardDescription>
            Дополнительная защита через SMS-коды (доступно для российских номеров)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Smartphone className="h-4 w-4" />
            <AlertDescription>
              SMS-коды автоматически используются при входе с нового устройства.
              Ваш номер телефона: привязан к аккаунту.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}