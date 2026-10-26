import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Appearance, useColorScheme, type TextStyle } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Токены темы приложения (E2.1-T6), фирменный стиль v0.1 (E1.8-T8): палитра «Петроль» — те же значения, что у веба
 * (artifacts/fintrack/src/index.css) и сайта. Компоненты берут цвета только отсюда, а не пишут свои.
 * Три темы (docs/brand/tokens.json): светлая, тёмная и кремово-золотая; выбор — в настройках, по умолчанию как в системе.
 */
const palette = {
  light: {
    background: "#F6F8F8",
    foreground: "#101718",
    muted: "#5E6B6D",
    border: "#E2E8E8",
    card: "#FFFFFF",
    subtle: "#EEF2F2",
    danger: "#C62828",
    success: "#1D7A3A",
    warning: "#9A5B00",
    // фирменный стиль (E1.8-T8): primary — фон и иконки, link — текст-ссылка, income и expense — суммы
    primary: "#0C6F76",
    // primarySolid — фон кнопок и чипов с белым текстом, переключатели, иконки и индикаторы. В светлой и тёмной темах
    // один петроль: 4.94:1 с белым, 4.64:1 на светлом и 3.79:1 на тёмном фоне; текст-ссылка на тёмном — colors.link
    primarySolid: "#107D86",
    onPrimary: "#FFFFFF",
    primarySubtle: "#EAF6F6",
    link: "#0C6F76",
    accent: "#5B4BD8",
    accentSubtle: "#F1EFFE",
    income: "#1D7A3A",
    expense: "#101718",
    transfer: "#5E6B6D",
    inputBorder: "#7F8C8E",
    successSubtle: "#E8F5EC",
    warningSubtle: "#FDF3E1",
    dangerSubtle: "#FDECEC",
    overlay: "rgba(14, 19, 20, 0.45)",
  },
  dark: {
    background: "#0E1314",
    foreground: "#E8EEEE",
    muted: "#93A0A2",
    border: "#2C3739",
    card: "#161D1E",
    subtle: "#1E2729",
    danger: "#F2726B",
    success: "#5CCB8A",
    warning: "#F5B544",
    // фирменный стиль (E1.8-T8): primary — фон и иконки, link — текст-ссылка, income и expense — суммы
    primary: "#5FC2C6",
    primarySolid: "#107D86",
    onPrimary: "#062528",
    primarySubtle: "#0A3B3F",
    link: "#5FC2C6",
    accent: "#A59BFF",
    accentSubtle: "#26224A",
    income: "#5CCB8A",
    expense: "#E8EEEE",
    transfer: "#93A0A2",
    inputBorder: "#5F6E70",
    successSubtle: "#163A24",
    warningSubtle: "#3D2C0E",
    dangerSubtle: "#3E1716",
    overlay: "rgba(0, 0, 0, 0.6)",
  },
  cream: {
    background: "#F7F1E3",
    foreground: "#24190B",
    muted: "#6B5C45",
    border: "#E4D8BF",
    card: "#FFFCF5",
    subtle: "#EFE6D2",
    danger: "#B42318",
    success: "#1D7A3A",
    warning: "#A3480A",
    // золото-бронза вместо петроля: несёт белый текст (5.36:1) и читается как текст на кремовом фоне (4.76:1)
    primary: "#8A6416",
    primarySolid: "#8A6416",
    onPrimary: "#FFFFFF",
    primarySubtle: "#F5EAD0",
    link: "#8A6416",
    accent: "#5B4BD8",
    accentSubtle: "#EFECFB",
    income: "#1D7A3A",
    expense: "#24190B",
    transfer: "#6B5C45",
    inputBorder: "#8C7B5E",
    successSubtle: "#E5F1E2",
    warningSubtle: "#FBE9DA",
    dangerSubtle: "#FBE7E4",
    overlay: "rgba(36, 25, 11, 0.45)",
  },
};

export type Colors = (typeof palette)["light"];

export type ThemeName = keyof typeof palette;
export type ThemePref = "system" | ThemeName;

/** Варианты для экрана настроек. */
export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "Как в системе" },
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Тёмная" },
  { value: "cream", label: "Кремовая" },
];

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
/**
 * Шрифт Onest (OFL) — пакет @expo-google-fonts/onest, загрузка useFonts() в корневом _layout, пока виден сплэш.
 * Начертание задаётся семейством, а не fontWeight: с fontWeight Android дорисует «ложный» жирный.
 */
export const family = {
  regular: "Onest_400Regular",
  medium: "Onest_500Medium",
  semibold: "Onest_600SemiBold",
  bold: "Onest_700Bold",
} as const;

/** Табличные цифры для сумм; вынесено в константу, чтобы `as const` не сделал массив readonly. */
const tabular: TextStyle["fontVariant"] = ["tabular-nums"];

export const font = {
  title: { fontSize: 26, lineHeight: 32, fontFamily: family.bold, letterSpacing: -0.3 },
  heading: { fontSize: 18, lineHeight: 24, fontFamily: family.semibold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: family.regular },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: family.medium },
  // суммы: у Onest есть табличные цифры — столбцы сумм выровнены
  amountHero: { fontSize: 36, lineHeight: 44, fontFamily: family.semibold, fontVariant: tabular, letterSpacing: -0.7 },
  amountLarge: { fontSize: 24, lineHeight: 32, fontFamily: family.semibold, fontVariant: tabular, letterSpacing: -0.2 },
  amount: { fontSize: 16, lineHeight: 24, fontFamily: family.medium, fontVariant: tabular },
} as const;

const THEME_KEY = "theme";
const isPref = (value: unknown): value is ThemePref => THEME_OPTIONS.some((option) => option.value === value);

/** Выбор читаем синхронно до первого кадра — без мигания чужой темой. Не секрет, но SecureStore уже есть и синхронный. */
function readPref(): ThemePref {
  try {
    const value = SecureStore.getItem(THEME_KEY);
    return isPref(value) ? value : "system";
  } catch {
    return "system";
  }
}

const ThemeContext = createContext<{ pref: ThemePref; setPref: (pref: ThemePref) => void }>({
  pref: "system",
  setPref: () => undefined,
});

/** Корень приложения. Системные элементы (клавиатура, диалоги, строка состояния) получают светлую или тёмную схему по теме. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  useEffect(() => {
    Appearance.setColorScheme(pref === "system" ? "unspecified" : pref === "dark" ? "dark" : "light");
  }, [pref]);
  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    void SecureStore.setItemAsync(THEME_KEY, next).catch(() => undefined);
  }, []);
  const value = useMemo(() => ({ pref, setPref }), [pref, setPref]);
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useThemePref() {
  return useContext(ThemeContext);
}

export function useColors(): Colors {
  const { pref } = useContext(ThemeContext);
  const scheme = useColorScheme();
  return palette[pref === "system" ? (scheme === "dark" ? "dark" : "light") : pref];
}
