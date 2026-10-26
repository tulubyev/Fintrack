/**
 * Темы веба: светлая, тёмная и кремово-золотая (docs/brand/tokens.json), по умолчанию — как в системе.
 * Класс темы на <html> ставит next-themes, выбор хранится в localStorage под ключом «theme» — тем же, что у сайта
 * (artifacts/site), поэтому на одном домене выбор общий. До загрузки бандла класс ставит скрипт в index.html.
 */
import { useEffect, type ReactNode } from 'react';
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';

export type ThemePref = 'system' | 'light' | 'dark' | 'cream';

export const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'Как в системе' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'cream', label: 'Кремовая' },
];

/** Цвет строки браузера на телефоне — фон текущей темы. */
function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    // класс темы next-themes ставит в своём эффекте, а он идёт после эффектов детей — читаем цвет кадром позже
    const frame = requestAnimationFrame(() => {
      const color = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
      if (color) document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', color));
    });
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);
  return null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" themes={['light', 'dark', 'cream']} defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <ThemeColorMeta />
    </NextThemesProvider>
  );
}

export function useThemePref(): { pref: ThemePref; setPref: (pref: ThemePref) => void } {
  const { theme, setTheme } = useTheme();
  const pref = THEME_OPTIONS.some((option) => option.value === theme) ? (theme as ThemePref) : 'system';
  return { pref, setPref: setTheme };
}
