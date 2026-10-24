import { useColorScheme } from "react-native";

/**
 * Токены темы приложения (E2.1-T6). Цвета — из темы веба (artifacts/fintrack/src/index.css), чтобы приложение
 * и сайт выглядели одним продуктом. Компоненты берут цвета только отсюда, а не пишут свои.
 */
const palette = {
  light: {
    background: "hsl(210, 40%, 98%)",
    foreground: "hsl(210, 40%, 8%)",
    muted: "hsl(210, 15%, 45%)",
    border: "hsl(210, 20%, 88%)",
    card: "#ffffff",
    subtle: "hsl(210, 30%, 95%)",
    danger: "hsl(0, 72%, 45%)",
    success: "hsl(142, 64%, 32%)",
    warning: "hsl(32, 95%, 40%)",
  },
  dark: {
    background: "hsl(210, 40%, 8%)",
    foreground: "hsl(210, 40%, 95%)",
    muted: "hsl(210, 15%, 65%)",
    border: "hsl(210, 20%, 22%)",
    card: "hsl(210, 35%, 12%)",
    subtle: "hsl(210, 30%, 16%)",
    danger: "hsl(0, 72%, 62%)",
    success: "hsl(142, 55%, 52%)",
    warning: "hsl(32, 95%, 58%)",
  },
};

export type Colors = (typeof palette)["light"];

export const PRIMARY = "hsl(210, 100%, 50%)";

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = {
  title: { fontSize: 26, fontWeight: "700" },
  heading: { fontSize: 18, fontWeight: "600" },
  body: { fontSize: 16 },
  caption: { fontSize: 13 },
} as const;

export function useColors(): Colors {
  return palette[useColorScheme() === "dark" ? "dark" : "light"];
}
