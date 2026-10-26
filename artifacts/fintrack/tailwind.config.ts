import type { Config } from "tailwindcss";

type Colors = { [key: string]: string | Colors };
type ColorFn = (options: { opacityValue?: string }) => string;

// Цвета темы — переменные с готовым hsl(...), и Tailwind сам не умеет добавить к ним прозрачность:
// без этой обёртки классы вида bg-primary/5 и hover:bg-muted/60 молча не генерируются
function withOpacity(colors: Colors): { [key: string]: ColorFn | ReturnType<typeof withOpacity> } {
  return Object.fromEntries(Object.entries(colors).map(([key, value]) => [
    key,
    typeof value === "string"
      ? ({ opacityValue }: { opacityValue?: string }) =>
          opacityValue === undefined ? value : `color-mix(in srgb, ${value} calc(${opacityValue} * 100%), transparent)`
      : withOpacity(value),
  ]));
}

export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: withOpacity({
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        // статусы: бюджет в норме / близко к лимиту (для прогресса и подписей)
        success: "var(--success)",
        warning: "var(--warning)",
        // фирменный стиль (E1.8-T8): деньги — доход зелёным, расход цветом текста; знак направления дублирует цвет
        income: "var(--income)",
        expense: "var(--expense)",
        transfer: "var(--transfer)",
        info: "var(--info)",
        "primary-subtle": {
          DEFAULT: "var(--primary-subtle)",
          foreground: "var(--primary-subtle-foreground)",
        },
        // акцент «Сирень» — только для советов, не для кнопок и навигации
        "brand-accent": {
          DEFAULT: "var(--brand-accent)",
          foreground: "var(--brand-accent-foreground)",
          subtle: "var(--brand-accent-subtle)",
        },
        "success-subtle": "var(--success-subtle)",
        "warning-subtle": "var(--warning-subtle)",
        "warning-solid": "var(--warning-solid)",
        "destructive-subtle": "var(--destructive-subtle)",
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          "1": "var(--chart-1)",
          "2": "var(--chart-2)",
          "3": "var(--chart-3)",
          "4": "var(--chart-4)",
          "5": "var(--chart-5)",
          "6": "var(--chart-6)",
          "7": "var(--chart-7)",
          "8": "var(--chart-8)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
      }),
      boxShadow: {
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
        fab: "var(--shadow-fab)",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        serif: ["var(--font-serif)"],
        mono: ["var(--font-mono)"],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
