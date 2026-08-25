import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  BarChart3, 
  CreditCard, 
  Target, 
  TrendingUp, 
  Banknote,
  Bot,
  Settings,
  Building2,
  PieChart,
  TestTube
} from "lucide-react";

const navigationItems = [
  {
    name: "Главная",
    href: "/",
    icon: BarChart3,
    emoji: "📊"
  },
  {
    name: "Банковские счета", 
    href: "/accounts",
    icon: Building2,
    emoji: "🏦"
  },
  {
    name: "Карты и платежи",
    href: "/cards",
    icon: CreditCard,
    emoji: "💳"
  },
  {
    name: "Анализ трат",
    href: "/analytics",
    icon: PieChart,
    emoji: "📈"
  },
  {
    name: "Финансовые цели",
    href: "/goals",
    icon: Target,
    emoji: "🎯"
  },
  {
    name: "Инвестиции",
    href: "/investments",
    icon: TrendingUp,
    emoji: "💰"
  },
];

const utilityItems = [
  {
    name: "AI Помощник",
    href: "/ai",
    icon: Bot,
    emoji: "🤖"
  },
  {
    name: "Настройки",
    href: "/settings",
    icon: Settings,
    emoji: "⚙️"
  },
];

const developmentItems = [
  {
    name: "Тестирование",
    href: "/testing",
    icon: TestTube,
    emoji: "🧪"
  },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 bg-card border-r border-border hidden lg:block">
      <nav className="p-6 space-y-2">
        {/* Main Navigation */}
        {navigationItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <span className="text-lg">{item.emoji}</span>
              <span>{item.name}</span>
            </Link>
          );
        })}
        
        <hr className="border-border my-4" />
        
        {/* Utility Navigation */}
        {utilityItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
              data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <span className="text-lg">{item.emoji}</span>
              <span>{item.name}</span>
            </Link>
          );
        })}

        {/* Development Navigation - Only in development */}
        {import.meta.env.DEV && (
          <>
            <hr className="border-border my-4" />
            {developmentItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                      : "text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:text-orange-300 dark:hover:bg-orange-900"
                  )}
                  data-testid={`dev-nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <span className="text-lg">{item.emoji}</span>
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>
    </aside>
  );
}
