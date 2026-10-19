import {
  ArrowLeftRight, Home, PieChart, Repeat, Settings, Shield, Tags, Target, Upload, Wallet, type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Разделы этапа 1. «Карты», «Инвестиции» и AI-помощник вернутся в своих эпиках (решение D15)
export const MAIN_NAV: NavItem[] = [
  { href: '/', label: 'Главная', icon: Home },
  { href: '/transactions', label: 'Операции', icon: ArrowLeftRight },
  { href: '/accounts', label: 'Счета', icon: Wallet },
  { href: '/import', label: 'Импорт', icon: Upload },
  { href: '/budgets', label: 'Бюджеты', icon: PieChart },
  { href: '/goals', label: 'Цели', icon: Target },
  { href: '/subscriptions', label: 'Подписки', icon: Repeat },
  { href: '/categories', label: 'Категории', icon: Tags },
];

export const SETTINGS_NAV: NavItem = { href: '/settings', label: 'Настройки', icon: Settings };
export const ADMIN_NAV: NavItem = { href: '/admin', label: 'Админ-панель', icon: Shield };

/** Пункт активен на своём пути и на вложенных (/accounts/123 → «Счета»); главная — только на «/». */
export function isActive(href: string, location: string): boolean {
  if (href === '/') return location === '/';
  return location === href || location.startsWith(`${href}/`);
}
