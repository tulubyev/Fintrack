/**
 * Каркас экранов: ≥ 768 px — боковая панель и шапка; < 768 px — шапка и нижняя навигация
 * из пяти пунктов (Главная, Операции, «+», Бюджеты, Ещё). «Ещё» открывает остальные разделы.
 */
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { LogOut, Menu, Plus, Settings } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { QuickAddProvider, useQuickAdd } from '@/features/transactions/QuickAdd';
import { useAuth, type User } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, isActive, MAIN_NAV, SETTINGS_NAV, type NavItem } from './navigation';
import { BrandMark } from '@/components/BrandMark';

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold text-foreground" aria-label="FinTrack — на главную">
      <BrandMark className="size-8" />
      <span className="text-lg">FinTrack</span>
    </Link>
  );
}

function NavLink({ item, location, onNavigate }: { item: NavItem; location: string; onNavigate?: () => void }) {
  const active = isActive(item.href, location);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <item.icon className="size-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}

function Sidebar({ location, isAdmin }: { location: string; isAdmin: boolean }) {
  const quickAdd = useQuickAdd();
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-sidebar md:flex" data-testid="sidebar">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="px-3 pb-2">
        <Button className="w-full justify-start" onClick={() => quickAdd.open()} title="Клавиша N" data-testid="sidebar-add">
          <Plus className="mr-2 size-4" />Добавить операцию
        </Button>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-2" aria-label="Разделы">
        {MAIN_NAV.map((item) => <NavLink key={item.href} item={item} location={location} />)}
      </nav>
      <div className="flex flex-col gap-1 border-t px-3 py-3">
        <NavLink item={SETTINGS_NAV} location={location} />
        {isAdmin && <NavLink item={ADMIN_NAV} location={location} />}
      </div>
    </aside>
  );
}

const initials = (user: User) =>
  [user.firstName, user.lastName].map((part) => part?.trim()?.[0] ?? '').join('').toUpperCase() || '₽';

function UserMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Профиль';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="Меню профиля" data-testid="user-menu">
          <Avatar className="size-8">
            {user.profileImageUrl && <AvatarImage src={user.profileImageUrl} alt="" />}
            <AvatarFallback className="text-xs">{initials(user)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings"><Settings className="mr-2 size-4" />Настройки</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onLogout} data-testid="nav-logout">
          <LogOut className="mr-2 size-4" />Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Header({ user, onLogout }: { user: User; onLogout: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b bg-background/95 px-4 backdrop-blur md:justify-end md:px-8">
      <div className="md:hidden"><Logo /></div>
      <div className="flex items-center gap-2">
        <NotificationBell />
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}

function BottomNav({ location, isAdmin }: { location: string; isAdmin: boolean }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const quickAdd = useQuickAdd();
  const [home, transactions, , , budgets] = MAIN_NAV;
  const more = [...MAIN_NAV.filter((item) => ![home, transactions, budgets].includes(item)), SETTINGS_NAV, ...(isAdmin ? [ADMIN_NAV] : [])];
  const moreActive = more.some((item) => isActive(item.href, location));

  const tab = (item: NavItem) => {
    const active = isActive(item.href, location);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={cn('flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium', active ? 'text-primary' : 'text-muted-foreground')}
      >
        <item.icon className="size-5" aria-hidden />
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Разделы"
      data-testid="bottom-nav"
    >
      {tab(home)}
      {tab(transactions)}
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={() => quickAdd.open()}
          className="flex size-12 -translate-y-3 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          aria-label="Добавить операцию"
          data-testid="fab-add"
        >
          <Plus className="size-6" />
        </button>
      </div>
      {tab(budgets)}
      <button
        type="button"
        onClick={() => setMoreOpen(true)}
        className={cn('flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium', moreActive ? 'text-primary' : 'text-muted-foreground')}
        data-testid="nav-more"
      >
        <Menu className="size-5" aria-hidden />
        Ещё
      </button>
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SheetHeader>
            <SheetTitle>Разделы</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid gap-1">
            {more.map((item) => <NavLink key={item.href} item={item} location={location} onNavigate={() => setMoreOpen(false)} />)}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, isAdmin, logout } = useAuth();
  if (!user) return null;

  return (
    <QuickAddProvider>
      <div className="min-h-screen bg-background">
        <Sidebar location={location} isAdmin={isAdmin} />
        <div className="flex min-h-screen flex-col md:pl-60">
          <Header user={user} onLogout={() => void logout()} />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
        </div>
        <BottomNav location={location} isAdmin={isAdmin} />
      </div>
    </QuickAddProvider>
  );
}
