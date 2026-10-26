import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, User, Phone, Mail, Calendar, IdCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface EsiaAuthProps {
  onSuccess?: (user: any) => void;
  onError?: (error: string) => void;
}

export function EsiaAuth({ onSuccess, onError }: EsiaAuthProps) {
  const [loading, setLoading] = useState(false);
  const [mockFormVisible, setMockFormVisible] = useState(false);
  const [mockData, setMockData] = useState({
    firstName: 'Александр',
    lastName: 'Иванов',
    middleName: 'Сергеевич',
    email: 'a.ivanov@example.ru',
    mobile: '+79161234567',
    birthDate: '1985-06-15',
    gender: 'M',
    snils: '12345678901',
  });
  const { toast } = useToast();

  const handleEsiaAuth = async () => {
    try {
      setLoading(true);
      
      // Получаем URL авторизации ЕСИА
      const response = await fetch('/api/auth/esia/authorize', {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error('Ошибка получения URL авторизации');
      }
      
      const data = await response.json();
      
      // В реальном приложении перенаправляем пользователя
      window.location.href = data.authUrl;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка авторизации';
      toast({
        title: 'Ошибка',
        description: errorMessage,
        variant: 'destructive',
      });
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleMockAuth = async () => {
    try {
      setLoading(true);
      
      const response = await fetch('/api/auth/esia/mock', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mockData),
      });
      
      if (!response.ok) {
        throw new Error('Ошибка mock авторизации');
      }
      
      const data = await response.json();
      
      toast({
        title: 'Успех',
        description: data.message,
        variant: 'default',
      });
      
      // Сохраняем токен и вызываем callback
      if (data.accessToken) {
        localStorage.setItem('accessToken', data.accessToken);
      }
      
      onSuccess?.(data.user);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка mock авторизации';
      toast({
        title: 'Ошибка',
        description: errorMessage,
        variant: 'destructive',
      });
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Основная кнопка входа через Госуслуги */}
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 w-12 h-12 bg-primary-subtle rounded-full flex items-center justify-center">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Вход через Госуслуги</CardTitle>
          <CardDescription>
            Безопасная авторизация через единую систему идентификации и аутентификации
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge variant="secondary" className="text-xs">
              <Shield className="w-3 h-3 mr-1" />
              Подтвержденная личность
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <IdCard className="w-3 h-3 mr-1" />
              Данные из документов
            </Badge>
          </div>
          
          <Button 
            onClick={handleEsiaAuth}
            disabled={loading}
            className="w-full bg-primary hover:bg-primary"
            data-testid="button-esia-auth"
          >
            {loading ? 'Перенаправление...' : 'Войти через Госуслуги'}
          </Button>
          
          <div className="text-xs text-muted-foreground text-center space-y-1">
            <p>При входе через Госуслуги вы получите:</p>
            <ul className="space-y-0.5">
              <li>• Автоматическую верификацию данных</li>
              <li>• Доступ к расширенным функциям</li>
              <li>• Повышенный уровень безопасности</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Mock форма для разработки */}
      {process.env.NODE_ENV === 'development' && (
        <Card className="w-full max-w-md mx-auto border-warning/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-warning">
                Тестирование ЕСИА
              </CardTitle>
              <Badge variant="outline" className="text-xs border-warning/30 text-warning">
                DEV
              </Badge>
            </div>
            <CardDescription>
              Mock авторизация для разработки и тестирования
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!mockFormVisible ? (
              <Button 
                variant="outline" 
                onClick={() => setMockFormVisible(true)}
                className="w-full border-warning/30 text-warning hover:bg-warning-subtle"
                data-testid="button-show-mock-form"
              >
                Показать форму тестирования
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">Имя</label>
                    <input
                      type="text"
                      value={mockData.firstName}
                      onChange={(e) => setMockData(prev => ({ ...prev, firstName: e.target.value }))}
                      className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                      data-testid="input-mock-firstname"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">Фамилия</label>
                    <input
                      type="text"
                      value={mockData.lastName}
                      onChange={(e) => setMockData(prev => ({ ...prev, lastName: e.target.value }))}
                      className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                      data-testid="input-mock-lastname"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">Отчество</label>
                  <input
                    type="text"
                    value={mockData.middleName}
                    onChange={(e) => setMockData(prev => ({ ...prev, middleName: e.target.value }))}
                    className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                    data-testid="input-mock-middlename"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">Телефон</label>
                    <input
                      type="tel"
                      value={mockData.mobile}
                      onChange={(e) => setMockData(prev => ({ ...prev, mobile: e.target.value }))}
                      className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                      data-testid="input-mock-phone"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground">СНИЛС</label>
                    <input
                      type="text"
                      value={mockData.snils}
                      onChange={(e) => setMockData(prev => ({ ...prev, snils: e.target.value }))}
                      className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                      data-testid="input-mock-snils"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground">Email</label>
                  <input
                    type="email"
                    value={mockData.email}
                    onChange={(e) => setMockData(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                    data-testid="input-mock-email"
                  />
                </div>

                <div className="flex gap-2">
                  <Button 
                    onClick={handleMockAuth}
                    disabled={loading}
                    size="sm"
                    className="flex-1 bg-warning-solid hover:bg-warning-solid text-primary-foreground"
                    data-testid="button-mock-auth"
                  >
                    {loading ? 'Авторизация...' : 'Mock вход'}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setMockFormVisible(false)}
                    size="sm"
                    className="border-warning/30"
                    data-testid="button-hide-mock-form"
                  >
                    Скрыть
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}