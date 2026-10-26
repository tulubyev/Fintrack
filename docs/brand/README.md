# FinTrack — фирменный стиль v0.1

Фирменный стиль для веба (fin-wall.ru, React + Tailwind + shadcn/ui) и Android-приложения (Expo).
Построен под позиционирование D1 «нейтральный финансовый советник поверх всех банков» и работает при варианте «трекер».
**Внедрено в E1.8-T8:**
- знак A «Кладка», палитра «Петроль» и шрифт Onest на сайте (`artifacts/site`) и в вебе (`artifacts/fintrack`);
- палитра, цвет ссылок и иконка — в приложении (`artifacts/mobile`); шрифт и сплэш в приложении — отдельной задачей.

Открытые вопросы владельцу — ниже. Имя (D22) ещё не выбрано: Finwall из `07-naming.md` занят в App Store, варианты — в описании PR T8.
Начать знакомство с **`brand-preview.html`** (открыть в браузере). Скриншоты превью в репозиторий не кладём — их собирает `scripts/screenshot.cjs`.

## Оглавление

| Файл | Что внутри |
|---|---|
| [01-platform.md](01-platform.md) | Суть, ценности, характер, отличия от банков и Дзен-мани, обещание; что меняется при варианте Б |
| [02-voice.md](02-voice.md) | Тон голоса: принципы, словарь, «так / не так» для онбординга, ошибок, пустых состояний, уведомлений, денежных предупреждений |
| [03-logo.md](03-logo.md) | Три концепции знака, обоснование, правила, иконка приложения и сплэш |
| [04-palette.md](04-palette.md) | Палитра, семантические цвета, доход и расход не только цветом, графики |
| [contrast-report.md](contrast-report.md) | Таблица контраста WCAG для всех пар обеих тем (собирается скриптом) |
| [05-typography.md](05-typography.md) | Шрифт Onest, шкала, как выглядит «−1 234,50 ₽», подключение в вебе и Expo |
| [06-iconography.md](06-iconography.md) | Иконки (Lucide на обеих платформах), иллюстрации, скругления, тени, плотность, движение |
| [07-naming.md](07-naming.md) | FinTrack, Finwall или другое имя: разбор и рекомендация |
| [tokens.json](tokens.json) | Все токены: цвета обеих тем, радиусы, отступы, тени, типографика — источник правды |
| [web-index.css.snippet](web-index.css.snippet) | Блоки `:root` и `.dark` для `artifacts/fintrack/src/index.css` в текущем формате `hsl(...)` |
| [mobile-theme.ts.snippet](mobile-theme.ts.snippet) | Замена `artifacts/mobile/src/ui/theme.ts` с той же структурой |
| `logos/` | SVG трёх концепций: знак и знак со словом, светлый, тёмный и одноцветный варианты; Finwall для сравнения |
| `app-icon/` | Android adaptive icon (слои SVG), favicon, сплэш, PWA; `app-icon/png/` — готовые PNG для Expo и веба |
| `brand-preview.html`, `brand-preview.png`, `brand-preview-mobile.png` | Превью: логотипы, палитра, шрифт, компоненты в двух темах, экран телефона |
| `scripts/` | `gen_logos.py` — SVG логотипов и иконок; `build.mjs` — сниппеты и отчёт о контрасте из `tokens.json`; `build-preview.cjs` — превью; `render-png.cjs` — PNG из SVG; `screenshot.cjs` — скриншот |

Пересборка после правки `tokens.json`:
```bash
cd brand
node scripts/build.mjs            # сниппеты + contrast-report.md
node scripts/build-preview.cjs    # brand-preview.html
node scripts/render-png.cjs       # PNG иконок (нужен playwright)
node scripts/screenshot.cjs 1280  # brand-preview.png
```
SVG логотипов и иконок генерирует `scripts/gen_logos.py` (Python, `pip install fonttools uharfbuzz`; слово переводится в кривые из Onest):
`python3 scripts/gen_logos.py . <папка с Onest-600.ttf>` — статические TTF берутся из Google Fonts. Сами SVG от скрипта и шрифта не зависят.

## Ключевые решения

1. **Знак «Кладка»** (рекомендую из трёх): верхний сплошной слой — FinTrack — лежит на кирпичах — ваших счетах в разных банках.
   Рисует позиционирование «поверх всех банков» и подходит обоим именам. Читается в 16 px.
2. **Основной цвет «Петроль»** `#0C6F76` (тёмная тема `#5FC2C6`) вместо банковского синего `hsl(210,100%,50%)`.
   Сине-бирюзовый не занят крупными банками. **Акцент «Сирень»** `#5B4BD8` / `#A59BFF` — только советник.
3. **Расход — цветом текста, не красным.** Доход зелёный `#1D7A3A` / `#5CCB8A`. Направление дублируется знаком «+»/«−» (U+2212),
   иконкой стрелки и подписью для диктора.
4. **Все пары «текст/фон» ≥ 4,5:1 и «элемент/фон» ≥ 3:1** в обеих темах — проверено скриптом, 0 нарушений.
5. **Шрифт Onest** (OFL, Google Fonts, `@expo-google-fonts/onest`): кириллица «родная», есть табличные цифры, минус и ₽.
6. **Иконки — Lucide на обеих платформах** (сейчас в приложении Ionicons); линия 1,75. Не срочно.
7. **Форма тихая**: карточки с границей без тени, скругления 12 / 16 / 24, одна главная цифра на экран.
8. **Имя**: рекомендую перейти на **Finwall («Финвол»)** до релиза в сторах — при условии чистой проверки товарных знаков (см. `07-naming.md`).

## Вопросы владельцу

1. **Имя.** FinTrack или Finwall? Заказать поиск по товарным знакам (ФИПС, классы 09, 36, 42) и проверить домены finwall.ru, финвол.рф — до E2.9.
2. **Знак.** A «Кладка», B «Горизонт» или C «Ф-баланс»? Нужны ли доработки (пропорции, цвет верхнего слоя)?
3. **D1.** Подтверждаете вариант «советник»? От него зависят тексты и роль сирени; палитра и знак — нет.
4. **Расход цветом текста**, а не красным, как в большинстве банковских приложений — согласны?
5. **Шрифт.** Подключать Onest с Google Fonts или раздавать с нашего сервера (нет запросов к Google — проще с 152-ФЗ и доступностью из РФ)?
6. **Иконка приложения**: фон с мягким градиентом (как в макете) или сплошной петроль 700?
7. **Иконки приложения на Lucide** — делать сейчас, в рамках E2.1, или после публикации (E2.9)?
8. **Цвета банков** в бейджах счетов (`AccountIcon.tsx`) оставляем? Рекомендую да — только там.

## План внедрения

Оценки — в рабочих днях одного разработчика, как в `docs/product/ROADMAP.md`. Каждый шаг — отдельная задача и PR.
Шаги 1–6 — ядро (≈ 3,5–4,5 дня), остальное — по мере готовности.

### Шаг 1. Цвета веба — 0,5–1 д
- `artifacts/fintrack/src/index.css`: заменить блоки `:root` и `.dark` на содержимое `web-index.css.snippet` (формат тот же — `hsl(...)`,
  `withOpacity()` в `tailwind.config.ts` продолжает работать). Утилиты `.tabular` / `.amount` — оттуда же.
- `artifacts/fintrack/tailwind.config.ts`, внутри `withOpacity({...})` добавить новые токены:
  ```ts
  income: "var(--income)", expense: "var(--expense)", transfer: "var(--transfer)", info: "var(--info)",
  "brand-accent": { DEFAULT: "var(--brand-accent)", foreground: "var(--brand-accent-foreground)", subtle: "var(--brand-accent-subtle)" },
  "primary-subtle": { DEFAULT: "var(--primary-subtle)", foreground: "var(--primary-subtle-foreground)" },
  "success-subtle": "var(--success-subtle)", "warning-subtle": "var(--warning-subtle)", "warning-solid": "var(--warning-solid)",
  "destructive-subtle": "var(--destructive-subtle)",
  // и в chart: "6": "var(--chart-6)", "7": "var(--chart-7)", "8": "var(--chart-8)"
  ```
  и `boxShadow: { raised: "var(--shadow-raised)", overlay: "var(--shadow-overlay)", fab: "var(--shadow-fab)" }`.
- `features/transactions/TransactionFeed.tsx`, строка 35: `text-[hsl(142,71%,32%)]` → `text-income`; рядом со знаком — иконки
  `ArrowDownLeft` / `ArrowUpRight` 14 px и `aria-label` («Доход, 86 500 рублей»).
- Проверить вручную: главная, операции, бюджеты, импорт, настройки — в обеих темах.

### Шаг 2. Шрифт и суммы на вебе — 0,5 д
- `artifacts/fintrack/index.html`: ссылку на Inter заменить на `family=Onest:wght@400..700` (переменная `--font-sans` уже в сниппете).
- Все суммы — с `tabular-nums` (в ленте уже есть; проверить бюджеты, цели, главную, импорт — 19 файлов с `formatMoney`).
- `lib/shared/src/money.ts`, строка 18: пробел перед символом валюты → ` `; обновить ожидания в тестах `lib/shared`.
  Изменение общее для веба и приложения.

### Шаг 3. Логотип, favicon, manifest веба — 0,5 д
- `components/layout/AppShell.tsx`, компонент `Logo`: квадрат с «₽» заменить на SVG знака (`logos/a-kladka/mark-light.svg`, в тёмной теме — `mark-dark.svg`,
  или один inline-SVG с `fill="var(--primary)"` и `fill="var(--foreground)"`).
- `public/favicon.svg` ← `app-icon/favicon.svg` (сейчас там оранжевый квадрат `#FF3C00`; новый сам меняет цвета по теме системы).
- `public/apple-touch-icon.png` ← `app-icon/png/apple-touch-icon-180.png`; `public/icons/pwa-192.png`, `pwa-maskable-512.png`.
- `index.html`:
  ```html
  <meta name="theme-color" content="#F6F8F8" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#0E1314" media="(prefers-color-scheme: dark)">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">
  ```
- `public/manifest.webmanifest` (сейчас его нет; полноценный PWA — эпик E1.7, это заготовка):
  ```json
  { "name": "FinTrack", "short_name": "FinTrack", "lang": "ru", "start_url": "/", "display": "standalone",
    "background_color": "#F6F8F8", "theme_color": "#0C6F76",
    "icons": [
      { "src": "/icons/pwa-192.png", "sizes": "192x192", "type": "image/png" },
      { "src": "/icons/pwa-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" } ] }
  ```

### Шаг 4. Тема и шрифт приложения — 1–1,5 д
- `artifacts/mobile/src/ui/theme.ts` ← `mobile-theme.ts.snippet`. Структура та же (`palette.light/dark`, `PRIMARY`, `space`, `radius`, `font`,
  `useColors`), новые ключи добавлены в конец. **Проверено**: всё приложение (`src/**`) с новой темой проходит `tsc` без ошибок.
- `PRIMARY` одна на обе темы, поэтому выбран компромисс `#107D86`: белый текст на ней 4,94:1, на светлом фоне 4,64:1, на тёмном — 3,79:1
  (достаточно для иконок, переключателей, индикаторов). Где `PRIMARY` — это **текст** на тёмном фоне, перейти на `colors.link`:
  `Button variant="link"` в `kit.tsx` и `tabBarActiveTintColor` в `app/(tabs)/_layout.tsx` — две строки.
- `kit.tsx`, `Money`: доход — `colors.income` + иконка направления + `accessibilityLabel`; размеры сумм — `font.amount*`.
- Шрифт: `pnpm --filter @workspace/mobile add @expo-google-fonts/onest expo-font expo-splash-screen`, `useFonts` в `src/app/_layout.tsx`
  (код — в `05-typography.md`); 8 мест с `fontWeight` заменить на `fontFamily: family.*`. Работает и в Expo Go (iOS по D17).

### Шаг 5. Иконка и сплэш приложения — 0,5 д + проверка сборки в CI
- Скопировать в `artifacts/mobile/assets/`: `icon-1024.png`, `adaptive-foreground-1024.png`, `adaptive-background-1024.png`,
  `adaptive-monochrome-1024.png`, `splash-icon-light-1024.png`, `splash-icon-dark-1024.png` из `app-icon/png/`.
- `artifacts/mobile/app.config.ts`:
  ```ts
  icon: "./assets/icon-1024.png",
  android: {
    // …как сейчас, плюс:
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-foreground-1024.png",
      backgroundImage: "./assets/adaptive-background-1024.png", // или backgroundColor: "#0A5E64"
      monochromeImage: "./assets/adaptive-monochrome-1024.png",  // тематические иконки Android 13+
    },
  },
  plugins: [
    // …как сейчас, плюс:
    ["expo-splash-screen", {
      image: "./assets/splash-icon-light-1024.png", imageWidth: 160, backgroundColor: "#F6F8F8",
      dark: { image: "./assets/splash-icon-dark-1024.png", backgroundColor: "#0E1314" },
    }],
  ],
  ```
- Папка `android/` генерируется (`expo prebuild` в `mobile-android.yml`), так что больше ничего не нужно. Проверить APK из артефакта CI
  на телефоне: круглая и квадратная маски, тематическая иконка, сплэш в обеих темах.

### Шаг 6. Если выбрано имя Finwall — 1 д
`name` в `app.config.ts`, `<title>` и manifest, слово в логотипе (`logo-finwall-*.svg` уже готовы), письма (`notificationEmailService`),
тексты онбординга и политики; `ru.finwall.app` и `scheme` не трогать.

### Шаг 7. Захардкоженные цвета веба — 2–3 д
256 hex-цветов в 16 файлах `.tsx` (в основном старые экраны: `admin/*`, `AuthForm`, `ProfileSection`, `DocumentsSection`, `security/*`)
и около 100 классов палитры Tailwind (`text-green-700`, `bg-blue-50`…) в 7 файлах (`VerificationCard`, `VerificationModal`…).
Перевести на токены: иначе в новой палитре эти экраны останутся синими и не будут работать в тёмной теме. Можно частями.

### Шаг 8. Иконки приложения на Lucide — 1–2 д (по решению)
`lucide-react-native` + `react-native-svg`, замена внутри `Icon` в `kit.tsx`, таблица соответствия ~60 имён Ionicons.

### Шаг 9. Тексты по тону голоса — 1–2 д
Пройти ошибки API (`ErrorCodes` → сообщения), пустые состояния, уведомления (`NOTIFICATION_TYPES`), письма по `02-voice.md`.

### Шаг 10. Графика для сторов — 1 д, в рамках E2.9
Обложка 1024 × 500, скриншоты с подписями, иконка 512 для Google Play — из этих же элементов.

| Шаг | Дней |
|---|---|
| 1–5 ядро (веб + приложение) | 3–4 |
| 6 переименование (если да) | 1 |
| 7 чистка цветов веба | 2–3 |
| 8 Lucide в приложении | 1–2 |
| 9 тексты | 1–2 |
| 10 сторы | 1 |
| **Всего** | **9–13** |

## Лицензии

- Шрифт Onest — SIL Open Font License 1.1 (github.com/simpals/onest, Google Fonts). В SVG логотипов слово переведено в кривые — это разрешено OFL.
- Иконки Lucide — ISC; Ionicons — MIT.
- Знаки, палитра и иллюстрации — оригинальные, нарисованы для FinTrack; чужие бренды не использованы.
