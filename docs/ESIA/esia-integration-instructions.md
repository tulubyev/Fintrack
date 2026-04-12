# Инструкция по интеграции ЕСИА

Код компонента EsiaAuth сохранен в файле `EsiaAuth.tsx` в этой папке.

## Для возврата полной ЕСИА интеграции:

1. **Скопировать компонент:**
   ```bash
   cp docs/ESIA/EsiaAuth.tsx client/src/components/auth/EsiaAuth.tsx
   ```

2. **Обновить страницу login.tsx:**
   Заменить кнопку Госуслуг на:
   ```tsx
   import { EsiaAuth } from '@/components/auth/EsiaAuth';
   
   // В JSX:
   <EsiaAuth 
     onSuccess={(user) => {
       toast({
         title: "Авторизация успешна",
         description: `Добро пожаловать, ${user.firstName}!`,
       });
       setLocation("/");
     }}
     onError={(error) => {
       toast({
         title: "Ошибка авторизации",
         description: error,
         variant: "destructive",
       });
     }}
   />
   ```

3. **API маршруты уже настроены** в `server/routes.ts`:
   - `/api/auth/esia/mock` - для тестирования
   - `/api/auth/esia/status` - проверка статуса
   - `/api/auth/esia/authorize` - реальная авторизация
   - `/api/auth/esia/callback` - обработка ответа

4. **Сервис ЕСИА готов** в `server/services/esiaService.ts`

## Текущая конфигурация

Сейчас используется простая кнопка "Вход через Госуслуги", которая вызывает `handleGosuslugiAuth()` - это mock-функция для демонстрации без полного UI ЕСИА.

Для production развертывания смотрите подробное руководство в `docs/esia-integration-guide.md`.