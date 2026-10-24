import { useEffect, useState } from 'react';
import { Baby, Car, Gift, GraduationCap, HeartPulse, House, PiggyBank, Plane, Shield, Smartphone, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Goal } from './api';

const ICONS: Record<string, LucideIcon> = {
  'piggy-bank': PiggyBank, plane: Plane, car: Car, house: House, 'graduation-cap': GraduationCap,
  gift: Gift, smartphone: Smartphone, 'heart-pulse': HeartPulse, baby: Baby, shield: Shield,
};

export const goalIconComponent = (icon: string | null) => (icon && ICONS[icon]) || PiggyBank;

export function GoalIcon({ goal, className }: { goal: Pick<Goal, 'icon' | 'completedAt'>; className?: string }) {
  const Icon = goalIconComponent(goal.icon);
  return (
    <span
      className={cn('flex size-10 shrink-0 items-center justify-center rounded-full', goal.completedAt ? 'bg-success/15 text-success' : 'bg-primary/10 text-primary', className)}
      aria-hidden
    >
      <Icon className="size-5" />
    </span>
  );
}

const COLORS = ['var(--primary)', 'var(--success)', 'var(--warning)', 'var(--chart-5)', 'var(--chart-4)'];
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Конфетти поверх карточки на 2,5 с; без анимации, если система просит меньше движения. */
export function Confetti() {
  const [pieces] = useState(() => Array.from({ length: 28 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.4,
    drift: (Math.random() - 0.5) * 120,
    color: COLORS[i % COLORS.length],
    size: 6 + Math.random() * 5,
  })));
  const [visible, setVisible] = useState(!reducedMotion());
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden data-testid="goal-confetti">
      {pieces.map((piece, i) => (
        <span
          key={i}
          className="absolute top-0 block rounded-sm"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size * 0.6,
            background: piece.color,
            animation: `confetti-fall 2.2s ease-in ${piece.delay}s forwards`,
            ['--drift' as string]: `${piece.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

/** Конфетти — один раз на цель в этом браузере. */
export function useCelebrateOnce(goal: Goal): boolean {
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (!goal.completedAt || goal.archivedAt) return;
    const key = `goal-celebrated:${goal.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      return; // без хранилища не празднуем, чтобы не повторять при каждом открытии
    }
    setCelebrate(true);
  }, [goal.id, goal.completedAt, goal.archivedAt]);
  return celebrate;
}
