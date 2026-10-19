import {
  ArrowLeftRight, Baby, Banknote, Bus, Car, CircleEllipsis, CircleHelp, Dumbbell, Gift, GraduationCap, HeartPulse, House,
  Landmark, PawPrint, Plane, Repeat, Scale, Send, Shirt, ShoppingBag, ShoppingBasket, Smartphone, Sparkles, Ticket,
  Utensils, Wallet, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlatCategory, Transaction } from './api';

// Значки системного справочника (lib/db/migrations/0003_system_categories.sql) — по имени lucide
const ICONS: Record<string, LucideIcon> = {
  'arrow-left-right': ArrowLeftRight, baby: Baby, banknote: Banknote, bus: Bus, car: Car, 'circle-ellipsis': CircleEllipsis,
  dumbbell: Dumbbell, gift: Gift, 'graduation-cap': GraduationCap, 'heart-pulse': HeartPulse, house: House, landmark: Landmark,
  'paw-print': PawPrint, plane: Plane, repeat: Repeat, send: Send, shirt: Shirt, 'shopping-bag': ShoppingBag,
  'shopping-basket': ShoppingBasket, smartphone: Smartphone, sparkles: Sparkles, ticket: Ticket, utensils: Utensils, wallet: Wallet,
};

export function CategoryIcon({ category, type, className }: { category?: FlatCategory; type: Transaction['type']; className?: string }) {
  const Icon = type === 'transfer' ? ArrowLeftRight
    : type === 'adjustment' ? Scale
    : (category?.icon && ICONS[category.icon]) || CircleHelp;
  const color = type === 'transfer' || type === 'adjustment' ? undefined : category?.color ?? undefined;
  return (
    <span
      className={cn('flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground', className)}
      style={color ? { backgroundColor: `${color}1f`, color } : undefined}
      aria-hidden
    >
      <Icon className="size-[18px]" />
    </span>
  );
}
