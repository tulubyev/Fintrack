#!/usr/bin/env node
/**
 * Собирает из tokens.json:
 *   - web-index.css.snippet   — блоки :root и .dark для artifacts/fintrack/src/index.css (формат shadcn, hsl(...));
 *   - mobile-theme.ts.snippet — замена artifacts/mobile/src/ui/theme.ts с той же структурой;
 *   - contrast-report.md      — коэффициенты контраста WCAG 2.1 для пар «текст/фон» и «элемент/фон».
 * Запуск: node scripts/build.mjs  (из папки brand). Зависимостей нет.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(readFileSync(join(root, "tokens.json"), "utf8"));
const { light, dark, mobile } = tokens.color;

// ---------- цвет ----------
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}
function hslToRgb([h, s, l]) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
const r1 = (v) => Math.round(v * 10) / 10;
const hslParts = (hex) => rgbToHsl(hexToRgb(hex)).map((v, i) => (i === 0 ? Math.round(v) : r1(v)));
const toHsl = (hex) => {
  const [h, s, l] = hslParts(hex);
  return `hsl(${h}, ${s}%, ${l}%)`;
};
const luminance = (rgb) => {
  const c = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
// контраст считаем по цвету, который реально окажется в CSS после округления HSL
const cssRgb = (hex) => hslToRgb(hslParts(hex));
const contrast = (a, b) => {
  const [x, y] = [luminance(cssRgb(a)), luminance(cssRgb(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// ---------- web-index.css.snippet ----------
const SHADCN_ORDER = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring",
  "success", "warning",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
];
const EXTRA_ORDER = [
  "primary-hover", "primary-subtle", "primary-subtle-foreground",
  "brand-accent", "brand-accent-foreground", "brand-accent-subtle",
  "income", "expense", "transfer",
  "success-subtle", "warning-solid", "warning-subtle", "destructive-subtle", "info", "info-subtle",
  "chart-6", "chart-7", "chart-8",
];
const cssVar = (name, value) => `  --${name}: ${value.startsWith("#") ? toHsl(value) : value};`;
function cssBlock(selector, theme, withStatic) {
  const lines = [`${selector} {`];
  lines.push(...SHADCN_ORDER.map((k) => cssVar(k, theme[k])));
  lines.push("  /* Новые токены бренда: деньги, статусы, акцент советника. В tailwind.config.ts — см. README, шаг 1 */");
  lines.push(...EXTRA_ORDER.map((k) => cssVar(k, theme[k])));
  lines.push(`  --overlay: ${theme.overlay};`);
  if (withStatic) {
    const t = tokens.typography.family;
    lines.push(
      `  --font-sans: '${t.sans}', ${t.fallback};`,
      "  --font-serif: Georgia, serif;",
      `  --font-mono: ${t.mono};`,
      `  --radius: ${tokens.radius["web-base"]};`,
      `  --shadow-raised: ${tokens.elevation.raised};`,
      `  --shadow-overlay: ${tokens.elevation.overlay};`,
      `  --shadow-fab: ${tokens.elevation.fab};`,
    );
  }
  lines.push("}");
  return lines.join("\n");
}
const css = `/* ===== FinTrack brand v${tokens.meta.version} — заменяет блоки :root и .dark в artifacts/fintrack/src/index.css =====
   Собрано из brand/tokens.json скриптом brand/scripts/build.mjs — правьте токены, а не этот файл.
   Формат тот же, что сейчас: переменная содержит готовый hsl(...), прозрачность даёт withOpacity() в tailwind.config.ts.
   Шрифт: в index.html заменить ссылку Inter на
   <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400..700&display=swap" rel="stylesheet"> */

${cssBlock(":root", light, true)}

${cssBlock(".dark", dark, false)}

/* Суммы: табличные цифры, чтобы столбцы сумм не «прыгали». Класс для сумм вне компонента Money. */
@layer utilities {
  .tabular { font-variant-numeric: tabular-nums; }
  .amount { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; white-space: nowrap; }
}
`;
writeFileSync(join(root, "web-index.css.snippet"), css);

// ---------- mobile-theme.ts.snippet ----------
const MOBILE_KEYS = {
  // существующие ключи — экраны их уже используют
  background: "background",
  foreground: "foreground",
  muted: "muted-foreground",
  border: "border",
  card: "card",
  subtle: "subtle",
  danger: "destructive",
  success: "success",
  warning: "warning",
  // новые ключи — добавляются, ничего не ломают; переводить экраны на них постепенно
  primary: "primary",
  onPrimary: "primary-foreground",
  primarySubtle: "primary-subtle",
  link: "primary",
  accent: "brand-accent",
  accentSubtle: "brand-accent-subtle",
  income: "income",
  expense: "expense",
  transfer: "transfer",
  inputBorder: "input",
  successSubtle: "success-subtle",
  warningSubtle: "warning-subtle",
  dangerSubtle: "destructive-subtle",
  overlay: "overlay",
};
const EXISTING = new Set(["background", "foreground", "muted", "border", "card", "subtle", "danger", "success", "warning"]);
const palBlock = (theme) =>
  Object.entries(MOBILE_KEYS)
    .map(([k, src], i) => `${i === EXISTING.size ? "    // новые ключи (необязательные для существующих экранов)\n" : ""}    ${k}: "${theme[src]}",`)
    .join("\n");
const fam = tokens.typography.family.mobile;
const sc = tokens.typography.scale;
const fontLine = (name, key, family) =>
  `  ${name}: { fontSize: ${sc[key].size}, lineHeight: ${sc[key].lineHeight}, fontFamily: family.${family}${sc[key].tabular ? ', fontVariant: tabular' : ""}${sc[key].letterSpacing ? `, letterSpacing: ${r1(sc[key].letterSpacing * sc[key].size)}` : ""} },`;
const ts = `import { useColorScheme, type TextStyle } from "react-native";

/**
 * Токены темы приложения (E2.1-T6) — бренд FinTrack v${tokens.meta.version}.
 * Собрано из brand/tokens.json (brand/scripts/build.mjs); значения совпадают с темой веба (artifacts/fintrack/src/index.css).
 * Компоненты берут цвета только отсюда, а не пишут свои.
 *
 * Структура прежняя: palette.light/dark с теми же ключами, PRIMARY, space, radius, font, useColors().
 * Новые ключи палитры добавлены в конец и экраны не ломают.
 */
const palette = {
  light: {
${palBlock(light)}
  },
  dark: {
${palBlock(dark)}
  },
};

export type Colors = (typeof palette)["light"];

/**
 * Одна на обе темы, как раньше: фон кнопок и чипов с белым текстом (${contrast(mobile.PRIMARY, "#FFFFFF").toFixed(2)}:1), переключатели,
 * иконки и индикаторы на светлом (${contrast(mobile.PRIMARY, light.background).toFixed(2)}:1) и тёмном (${contrast(mobile.PRIMARY, dark.background).toFixed(2)}:1) фоне.
 * Для текста-ссылки на тёмном фоне этого мало — используйте colors.link (${contrast(dark.primary, dark.background).toFixed(2)}:1).
 */
export const PRIMARY = "${mobile.PRIMARY}";

/**
 * Шрифт Onest (OFL) — пакет @expo-google-fonts/onest, загрузка useFonts() в корневом _layout до скрытия сплэша.
 * На Android начертание задаётся семейством, а не fontWeight: с fontWeight система дорисует «ложный» жирный.
 */
export const family = {
  regular: "${fam.regular}",
  medium: "${fam.medium}",
  semibold: "${fam.semibold}",
  bold: "${fam.bold}",
} as const;

/** Табличные цифры для сумм; вынесено в константу, чтобы \`as const\` не сделал массив readonly. */
const tabular: TextStyle["fontVariant"] = ["tabular-nums"];

export const space = { xs: ${tokens.space.xs}, sm: ${tokens.space.sm}, md: ${tokens.space.md}, lg: ${tokens.space.lg}, xl: ${tokens.space.xl} } as const;
export const radius = { sm: ${tokens.radius.sm}, md: ${tokens.radius.md}, lg: ${tokens.radius.lg}, pill: ${tokens.radius.pill} } as const;
export const font = {
${fontLine("title", "title", "bold")}
${fontLine("heading", "heading", "semibold")}
${fontLine("body", "body", "regular")}
${fontLine("caption", "caption", "medium")}
  // суммы: табличные цифры (у Onest есть tnum) — столбцы сумм выровнены
${fontLine("amountHero", "amount-hero", "semibold")}
${fontLine("amountLarge", "amount-lg", "semibold")}
${fontLine("amount", "amount", "medium")}
} as const;

export function useColors(): Colors {
  return palette[useColorScheme() === "dark" ? "dark" : "light"];
}
`;
writeFileSync(join(root, "mobile-theme.ts.snippet"), ts);

// ---------- contrast-report.md ----------
const TEXT_PAIRS = [
  ["foreground", "background", "основной текст на фоне"],
  ["foreground", "card", "основной текст на карточке"],
  ["foreground", "subtle", "текст на приглушённой подложке"],
  ["muted-foreground", "background", "вторичный текст на фоне"],
  ["muted-foreground", "card", "вторичный текст на карточке"],
  ["muted-foreground", "subtle", "вторичный текст на подложке"],
  ["primary", "background", "ссылка на фоне"],
  ["primary", "card", "ссылка на карточке"],
  ["primary-foreground", "primary", "текст основной кнопки"],
  ["primary-subtle-foreground", "primary-subtle", "активный пункт меню"],
  ["secondary-foreground", "secondary", "вторичная кнопка"],
  ["brand-accent", "card", "акцент советника — текст"],
  ["brand-accent-foreground", "brand-accent", "кнопка/бейдж советника"],
  ["brand-accent", "brand-accent-subtle", "текст на плашке советника"],
  ["income", "card", "доход на карточке"],
  ["income", "background", "доход на фоне"],
  ["expense", "card", "расход на карточке"],
  ["transfer", "card", "перевод между своими счетами"],
  ["success", "success-subtle", "успех на плашке"],
  ["warning", "card", "предупреждение — текст"],
  ["warning", "warning-subtle", "предупреждение на плашке"],
  ["destructive", "card", "ошибка — текст"],
  ["destructive", "destructive-subtle", "ошибка на плашке"],
  ["destructive-foreground", "destructive", "кнопка «Удалить»"],
  ["sidebar-accent-foreground", "sidebar-accent", "активный пункт боковой панели"],
];
const UI_PAIRS = [
  ["input", "card", "граница поля ввода"],
  ["input", "background", "граница поля ввода на фоне"],
  ["ring", "background", "кольцо фокуса"],
  ["primary", "subtle", "заполнение прогресса на треке"],
  ["warning-solid", "subtle", "прогресс «близко к лимиту»"],
  ["destructive", "subtle", "прогресс «перерасход»"],
  ...["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6", "chart-7", "chart-8"].map((c) => [c, "card", "цвет графика на карточке"]),
];
const mark = (v, need) => (v >= need ? "✅" : "❌");
const rows = (pairs, need) =>
  pairs
    .map(([fg, bg, what]) => {
      const l = contrast(light[fg], light[bg]);
      const d = contrast(dark[fg], dark[bg]);
      return `| ${what} | \`${fg}\` / \`${bg}\` | ${light[fg]} / ${light[bg]} | **${l.toFixed(2)}** ${mark(l, need)} | ${dark[fg]} / ${dark[bg]} | **${d.toFixed(2)}** ${mark(d, need)} |`;
    })
    .join("\n");
const mob = [
  ["PRIMARY / белый текст", mobile.PRIMARY, "#FFFFFF", 4.5],
  ["PRIMARY на светлом фоне (иконки, переключатели, текст)", mobile.PRIMARY, light.background, 4.5],
  ["PRIMARY на тёмном фоне (иконки, переключатели)", mobile.PRIMARY, dark.background, 3],
  ["PRIMARY на тёмной карточке", mobile.PRIMARY, dark.card, 3],
  ["PRIMARY как текст на тёмном фоне (не рекомендуется — есть colors.link)", mobile.PRIMARY, dark.background, 4.5],
];
let failures = 0;
const countFails = (pairs, need) => pairs.forEach(([fg, bg]) => {
  if (contrast(light[fg], light[bg]) < need) failures++;
  if (contrast(dark[fg], dark[bg]) < need) failures++;
});
countFails(TEXT_PAIRS, 4.5);
countFails(UI_PAIRS, 3);

const md = `# Контраст палитры FinTrack (WCAG 2.1)

Собрано скриптом \`scripts/build.mjs\` из \`tokens.json\`. Контраст посчитан по формуле WCAG 2.1 (относительная яркость sRGB)
для цвета, который получится в CSS после округления HSL.

Пороги: **4.5:1** — обычный текст (AA), **3:1** — крупный текст ≥ 18,66 px полужирный / 24 px и графические элементы
интерфейса (WCAG 1.4.11).

## Текст на фоне — нужно ≥ 4.5

| Пара | Токены | Светлая тема | Контраст | Тёмная тема | Контраст |
|---|---|---|---|---|---|
${rows(TEXT_PAIRS, 4.5)}

## Элементы интерфейса и графики — нужно ≥ 3

| Пара | Токены | Светлая тема | Контраст | Тёмная тема | Контраст |
|---|---|---|---|---|---|
${rows(UI_PAIRS, 3)}

## Приложение: константа PRIMARY (одна на обе темы)

| Где | Цвета | Контраст | Порог |
|---|---|---|---|
${mob.map(([what, a, b, need]) => `| ${what} | ${a} / ${b} | **${contrast(a, b).toFixed(2)}** ${mark(contrast(a, b), need)} | ${need} |`).join("\n")}

Последняя строка ожидаемо ниже 4.5: одна константа не может одновременно нести белый текст и быть текстом на тёмном фоне.
Поэтому в \`mobile-theme.ts.snippet\` добавлен \`colors.link\` по теме, а кнопка-ссылка в \`kit.tsx\` переводится на него (одна строка).

## Итог

Нарушений порогов в таблицах тем: **${failures}**.

Что ещё не проверяется контрастом и закрыто иначе:
- доход и расход различаются не только цветом: знак «+» / «−» (U+2212), иконка направления и текст для экранного диктора
  («Доход, 1 234,50 рубля») — см. \`04-palette.md\`;
- \`border\` (${light.border} / ${dark.border}) — декоративная граница карточек, ей 3:1 не требуется: карточку опознают по содержимому.
  Поля ввода получают отдельный токен \`input\` с контрастом ≥ 3:1.
`;
writeFileSync(join(root, "contrast-report.md"), md);
console.log(`ok: web-index.css.snippet, mobile-theme.ts.snippet, contrast-report.md; нарушений: ${failures}`);
