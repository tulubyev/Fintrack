# 5. Типографика

## Шрифт: Onest

| | |
|---|---|
| Авторы | Dmitri Voloshin, Andrey Kudryavtsev (проект Onest, github.com/simpals/onest) |
| Лицензия | SIL Open Font License 1.1 — бесплатно, можно встраивать в приложение и сайт |
| Веб | Google Fonts, вариативный 100–900: `family=Onest:wght@400..700` |
| Приложение | `@expo-google-fonts/onest` (на npm, версия 0.4.2) + `useFonts` из `expo-font` |
| Кириллица | 162 знака кириллицы, спроектирован прежде всего под русский язык |
| Цифры | по умолчанию пропорциональные; **табличные — через `tnum`** (проверено: все 10 цифр становятся шириной 672 единицы) |
| Нужные знаки | минус U+2212, ₽ U+20BD, неразрывный пробел U+00A0, узкий неразрывный U+202F |

Проверено скриптом на файлах Google Fonts (fontTools): таблица GSUB содержит `tnum`, `pnum`, `locl`, `calt`.

**Почему Onest.** Современный гротеск без «айтишной» холодности Inter, с открытыми формами и хорошей читаемостью в мелком кегле.
Сделан под кириллицу, а не дорисован к латинице — «д», «л», «ф», «ж» выглядят естественно. Один шрифт на всё — меньше загрузки.

**Что рассматривали.**

| Шрифт | Почему не основной |
|---|---|
| Inter (сейчас на сайте) | отличный и с `tnum`, но безликий — так выглядит половина интерфейсов. Если Onest не понравится — Inter остаётся лучшим запасным вариантом без изменений в шкале |
| Golos Text | хорош, но ассоциируется с Госуслугами — путаница с государственным сервисом нам не нужна |
| Manrope | всего 104 знака кириллицы, нет U+202F |
| IBM Plex Sans | в версии Google Fonts нет переключаемых `tnum`; характер «корпоративный» |
| Unbounded и другие акцидентные | для сумм и интерфейса слишком громкие |

## Шкала

| Токен | Размер / интерлиньяж | Начертание | Где |
|---|---|---|---|
| `display` | 40 / 48 | Bold 700, −2% | лендинг, крупный баланс на десктопе |
| `title` | 26 / 32 | Bold 700, −1% | заголовок экрана (в приложении — как сейчас, 26) |
| `h2` | 22 / 28 | SemiBold 600 | заголовок раздела |
| `heading` | 18 / 24 | SemiBold 600 | заголовок карточки, листа |
| `body` | 16 / 24 | Regular 400 | основной текст, строки списка |
| `body-sm` | 14 / 20 | Regular 400 | подсказки |
| `caption` | 13 / 18 | Medium 500 | подписи, даты, бейджи |
| `overline` | 12 / 16 | SemiBold 600, +4%, ПРОПИСНЫЕ | заголовки групп в списках |
| `amount-hero` | 36 / 44 | SemiBold 600, `tnum` | общий баланс |
| `amount-lg` | 24 / 32 | SemiBold 600, `tnum` | сумма в карточке |
| `amount` | 16 / 24 | Medium 500, `tnum` | сумма в строке операции |
| `amount-sm` | 13 / 18 | Medium 500, `tnum` | сумма в подписи |

Используются 4 начертания: 400, 500, 600, 700. Курсив не нужен.

## Как выглядит «−1 234,50 ₽»

```
−  1  ␣  234  ,  50  ␣  ₽
│     │          │      └─ знак рубля после суммы, перед ним U+00A0 (не переносится)
│     │          └─ запятая — десятичный разделитель; копейки только если не 00
│     └─ разряды разделены U+00A0 (так делает Intl.NumberFormat('ru-RU'))
└─ минус U+2212, не дефис: он шире и стоит на высоте цифр
```

Правила:
1. **Табличные цифры везде, где суммы стоят столбиком** (списки, таблицы, бюджеты) — иначе «1 111» уже, чем «8 888», и столбец «пляшет».
   Веб: `font-variant-numeric: tabular-nums` (класс Tailwind `tabular-nums`, он уже используется в `TransactionFeed.tsx`).
   Приложение: `fontVariant: ["tabular-nums"]` — у Onest это работает, у системного Roboto тоже.
2. **Неразрывный пробел перед «₽».** Сейчас `formatMoney` в `lib/shared/src/money.ts` (строка 18) ставит обычный пробел:
   `` `${sign}${formatted} ${currencySymbol(currency)}` `` — на узком экране «₽» может уехать на новую строку.
   Замена на ` ` — одна строка, тесты `lib/shared` проверят формат.
3. **В крупном балансе** копейки и «₽» — 60% кегля и цвет `muted-foreground`: `247 830`<sub>`,50 ₽`</sub>. Взгляд читает рубли.
   В строках списка — один кегль, без разбивки.
4. **Расход — со знаком «−», доход — со знаком «+»** только там, где важно направление (лента операций). В балансах знак не ставим.
5. **Сумма не переносится**: `white-space: nowrap` (класс `.amount` в `web-index.css.snippet`).
6. Отрицательный баланс счёта (кредитка) — `−12 400 ₽` цветом текста и подписью «долг», без красного.

## Подключение

**Веб** (`artifacts/fintrack/index.html`):
```html
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400..700&display=swap" rel="stylesheet">
```
и `--font-sans: 'Onest', system-ui, …` — уже в `web-index.css.snippet`. Если внешние шрифты нежелательны (152-ФЗ, доступность
Google из РФ) — положить woff2 в `public/fonts` и подключить `@font-face`: лицензия OFL это разрешает.

**Приложение** (`artifacts/mobile`):
```bash
pnpm --filter @workspace/mobile add @expo-google-fonts/onest expo-font expo-splash-screen
```
```tsx
// src/app/_layout.tsx
import { useFonts, Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold } from "@expo-google-fonts/onest";
import * as SplashScreen from "expo-splash-screen";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Onest_400Regular, Onest_500Medium, Onest_600SemiBold, Onest_700Bold });
  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync(); }, [fontsLoaded]);
  if (!fontsLoaded) return null;
  // …
}
```
`useFonts` работает и в Expo Go (разработка под iOS по D17), и в собранном APK. Встраивание через config-плагин `expo-font`
быстрее на старте, но в Expo Go не работает — его можно добавить позже только для сборок.

**Важно для Android:** начертание задаётся семейством (`fontFamily: "Onest_600SemiBold"`), а не `fontWeight`. Если указать и то и другое,
Android может дорисовать «ложный» жирный. В `mobile-theme.ts.snippet` токены `font.*` уже без `fontWeight`; остальные 8 мест с `fontWeight`
(`kit.tsx`, `SwipeRow.tsx`, `PinPad.tsx`, `NumPad.tsx`, `app/quick-add.tsx`, `app/sync-issues.tsx`) меняются на `fontFamily: family.*`.
