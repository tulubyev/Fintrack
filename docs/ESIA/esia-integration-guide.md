# Руководство по интеграции с ЕСИА (Госуслуги)

## Что такое ЕСИА

ЕСИА (Единая система идентификации и аутентификации) - это государственная система, которая позволяет пользователям Госуслуг авторизоваться в сторонних сервисах, используя свою учетную запись на Госуслугах.

## Преимущества интеграции

1. **Доверие пользователей** - государственная система вызывает больше доверия
2. **Верифицированные данные** - все данные проверены государством
3. **Безопасность** - высокий уровень защиты персональных данных
4. **Удобство** - пользователи не создают новые аккаунты

## Требования для подключения

### 1. Юридические требования
- Зарегистрированное в РФ юридическое лицо или ИП
- Соответствие требованиям ФЗ-152 "О персональных данных"
- Соглашение об информационном взаимодействии с Минцифрой

### 2. Технические требования
- HTTPS сертификат (обязательно)
- Поддержка ГОСТ криптографии
- Квалифицированная электронная подпись (КЭП)
- Российский IP-адрес для production

### 3. Сертификаты и ключи
- **Сертификат аутентификации** - для подписи запросов
- **Сертификат шифрования** - для шифрования данных
- **Корневые сертификаты Минцифры** - для проверки ответов

## Пошаговая инструкция подключения

### Этап 1: Подача заявки

1. **Перейдите на портал ЕСИА для разработчиков**
   ```
   https://digital.gov.ru/ru/activity/directions/63/
   ```

2. **Подготовьте документы:**
   - Заявление на подключение к ЕСИА
   - Копия свидетельства о регистрации юр. лица
   - Техническое задание на интеграцию
   - Согласие на обработку персональных данных

3. **Заполните техническое задание:**
   - URL вашего сервиса
   - Список запрашиваемых атрибутов пользователя
   - Описание бизнес-процессов
   - Схема информационного обмена

### Этап 2: Получение тестового доступа

1. **Тестовая среда ЕСИА:**
   ```
   https://esia-portal1.test.gosuslugi.ru/
   ```

2. **Получите тестовые учетные данные:**
   - `client_id` - идентификатор вашего приложения
   - `client_secret` - секретный ключ (генерируется автоматически)
   - `redirect_uri` - URL для возврата после авторизации

3. **Настройте тестовые сертификаты:**
   - Скачайте тестовые сертификаты с портала
   - Установите в хранилище сертификатов
   - Настройте подпись запросов

### Этап 3: Разработка интеграции

1. **OAuth 2.0 flow для ЕСИА:**

```javascript
// 1. Формирование URL авторизации
const authUrl = `https://esia-portal1.test.gosuslugi.ru/aas/oauth2/authorize?` +
  `client_id=${CLIENT_ID}&` +
  `response_type=code&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `scope=${encodeURIComponent('fullname email mobile')}&` +
  `state=${state}&` +
  `access_type=online`;

// 2. Обмен кода на токен
const tokenResponse = await fetch('https://esia-portal1.test.gosuslugi.ru/aas/oauth2/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    code: authCode,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    client_secret: signedClientSecret // Подписанный ГОСТ подписью
  })
});

// 3. Получение данных пользователя
const userResponse = await fetch(`https://esia-portal1.test.gosuslugi.ru/rs/prns/${oid}`, {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});
```

2. **Реализация ГОСТ подписи (КриптоПро CSP):**

```javascript
// Пример интеграции с КриптоПро CSP
const crypto = require('crypto');
const { execSync } = require('child_process');

function signWithGOST(data, certThumbprint) {
  // В production используйте КриптоПро CSP
  const command = `cryptcp -sign -thumbprint ${certThumbprint} -detached -der -base64`;
  const signature = execSync(`echo "${data}" | ${command}`, { encoding: 'utf8' });
  return signature.trim();
}

function generateClientSecret(params, certThumbprint) {
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  return signWithGOST(sortedParams, certThumbprint);
}
```

### Этап 4: Тестирование

1. **Создайте тестовую учетную запись на тестовом портале Госуслуг**
2. **Протестируйте полный flow авторизации**
3. **Проверьте получение всех необходимых атрибутов**
4. **Убедитесь в корректности подписи запросов**

### Этап 5: Получение production доступа

1. **Подайте заявку на production:**
   - Результаты тестирования
   - Документы о соответствии требованиям безопасности
   - Акт готовности к информационному взаимодействию

2. **Получите production сертификаты:**
   - Квалифицированный сертификат аутентификации
   - Квалифицированный сертификат шифрования

3. **Настройте production конфигурацию:**
   ```
   ESIA_BASE_URL=https://esia.gosuslugi.ru
   ESIA_CLIENT_ID=your_production_client_id
   ESIA_REDIRECT_URI=https://yourdomain.ru/auth/esia/callback
   ESIA_CERT_THUMBPRINT=your_production_cert_thumbprint
   ```

## Необходимые атрибуты пользователя

### Базовые атрибуты (всегда доступны):
- `oid` - уникальный идентификатор
- `firstName` - имя
- `lastName` - фамилия
- `middleName` - отчество
- `birthDate` - дата рождения
- `gender` - пол
- `trusted` - статус подтвержденной учетной записи

### Дополнительные атрибуты (требуют разрешения):
- `email` - адрес электронной почты
- `mobile` - номер мобильного телефона
- `snils` - СНИЛС
- `inn` - ИНН
- `passportNumber` - номер паспорта
- `birthPlace` - место рождения

## Настройка FinTrack для ЕСИА

### 1. Установите необходимые переменные окружения:

```bash
# Тестовая среда
ESIA_BASE_URL=https://esia-portal1.test.gosuslugi.ru
ESIA_CLIENT_ID=your_test_client_id
ESIA_REDIRECT_URI=https://your-replit-app.replit.app/api/auth/esia/callback
ESIA_CERT_THUMBPRINT=your_test_cert_thumbprint
ESIA_MOCK_MODE=true

# Production среда
ESIA_BASE_URL=https://esia.gosuslugi.ru
ESIA_CLIENT_ID=your_production_client_id
ESIA_REDIRECT_URI=https://fintrack.yourdomain.ru/api/auth/esia/callback
ESIA_CERT_THUMBPRINT=your_production_cert_thumbprint
ESIA_MOCK_MODE=false
```

### 2. Установите КриптоПро CSP (для production):

```bash
# Скачайте и установите КриптоПро CSP
# https://www.cryptopro.ru/products/csp/downloads

# Импортируйте сертификаты
certmgr -install -store uMy certificate.p12
```

### 3. Обновите конфигурацию ЕСИА сервиса:

```typescript
// В server/services/esiaService.ts
const config = {
  baseUrl: process.env.ESIA_BASE_URL || 'https://esia-portal1.test.gosuslugi.ru',
  clientId: process.env.ESIA_CLIENT_ID!,
  redirectUri: process.env.ESIA_REDIRECT_URI!,
  certThumbprint: process.env.ESIA_CERT_THUMBPRINT,
  mockMode: process.env.ESIA_MOCK_MODE === 'true',
};
```

## Стоимость и сроки

### Стоимость:
- **Подключение:** Бесплатно
- **Использование:** Бесплатно
- **Сертификаты:** 3000-15000 руб/год
- **КриптоПро CSP:** 5000-25000 руб/год

### Сроки:
- **Подача заявки:** 1-2 дня
- **Рассмотрение заявки:** 10-30 рабочих дней
- **Тестирование:** 5-15 дней
- **Production подключение:** 10-20 рабочих дней

**Общий срок:** 1-3 месяца

## Альтернативы для быстрого старта

### 1. Партнерские интеграторы:
- **Россия.Персона** - готовое решение за 50-100 тыс. руб
- **Единый портал госуслуг** - партнерская программа
- **CloudPayments** - интеграция через платежный шлюз

### 2. Упрощенные варианты:
- **SMS-верификация** - проверка по номеру телефона
- **Email-верификация** - подтверждение по электронной почте
- **Банковская карта** - верификация через мини-платеж

## Рекомендации для FinTrack

### Этап MVP (текущий):
1. Используйте mock-режим ЕСИА для демонстрации
2. Реализуйте SMS-верификацию как основной способ
3. Добавьте заглушку "Скоро: вход через Госуслуги"

### Этап Beta:
1. Подайте заявку на тестовый доступ к ЕСИА
2. Реализуйте полную интеграцию в тестовой среде
3. Проведите нагрузочное тестирование

### Этап Production:
1. Получите production сертификаты
2. Настройте мониторинг и логирование
3. Запустите полную интеграцию с ЕСИА

---

**Важно:** Для финтех-сервисов интеграция с ЕСИА критически важна для соответствия требованиям ЦБ РФ и получения лицензии на финансовую деятельность.