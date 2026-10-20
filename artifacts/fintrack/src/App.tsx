/**
 * Маршруты SPA (E1.0-T5). nginx отдаёт index.html на любой путь, поэтому каждый экран
 * открывается по прямой ссылке и после F5. Без сессии любой путь ведёт на /login?next=<путь>.
 */
import { Redirect, Route, Switch, useLocation, useSearch } from 'wouter';
import AdminPanel from '@/components/AdminPanel';
import { AuthForm } from '@/components/AuthForm';
import { AppShell } from '@/components/layout/AppShell';
import { AccountPage } from '@/features/accounts/AccountPage';
import { AccountsPage } from '@/features/accounts/AccountsPage';
import { BudgetPage } from '@/features/budgets/BudgetPage';
import { BudgetsPage } from '@/features/budgets/BudgetsPage';
import { GoalsPage } from '@/features/goals/GoalsPage';
import { SubscriptionsPage } from '@/features/recurring/SubscriptionsPage';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { AppSkeleton, OfflineScreen } from '@/pages/AppStatusScreens';
import { ComingSoonPage } from '@/pages/ComingSoonPage';
import { HomePage } from '@/features/dashboard/HomePage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TransactionsPage } from '@/features/transactions/TransactionsPage';

/** Только относительный путь этого же сайта: «//evil.example» и «/\evil» не пропускаем. */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

function LoginRoute() {
  const { signIn } = useAuth();
  return <AuthForm onAuthSuccess={signIn} />;
}

function RedirectToLogin() {
  const [location] = useLocation();
  const search = useSearch();
  const path = location + (search ? `?${search}` : '');
  return <Redirect to={path === '/' ? '/login' : `/login?next=${encodeURIComponent(path)}`} replace />;
}

function AfterLogin() {
  const next = new URLSearchParams(useSearch()).get('next');
  return <Redirect to={safeNext(next)} replace />;
}

function AdminRoute() {
  const { isAdmin, user } = useAuth();
  const [, navigate] = useLocation();
  // Роль приходит только с сервера; без неё раздела «не существует»
  if (!isAdmin) return <AppShell><NotFoundPage /></AppShell>;
  return <AdminPanel user={user} onBack={() => navigate('/')} />;
}

function AppRoutes() {
  const { user, status, retry } = useAuth();

  if (status === 'loading') return <AppSkeleton />;
  if (status === 'offline') return <OfflineScreen onRetry={retry} />;

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={LoginRoute} />
        <Route component={RedirectToLogin} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={AfterLogin} />
      <Route path="/admin/*?" component={AdminRoute} />
      <Route>
        <AppShell>
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/transactions" component={TransactionsPage} />
            <Route path="/accounts" component={AccountsPage} />
            <Route path="/accounts/:id">{(params) => <AccountPage key={params.id} id={params.id} />}</Route>
            <Route path="/import">
              <ComingSoonPage title="Импорт выписок" description="Загрузка выписок банков в CSV, XLSX и PDF без дублей." />
            </Route>
            <Route path="/budgets" component={BudgetsPage} />
            <Route path="/budgets/:id">{(params) => <BudgetPage key={params.id} id={params.id} />}</Route>
            <Route path="/goals" component={GoalsPage} />
            <Route path="/subscriptions" component={SubscriptionsPage} />
            <Route path="/categories">
              <ComingSoonPage title="Категории" description="Свои категории и правила автокатегоризации." />
            </Route>
            <Route path="/settings" component={SettingsPage} />
            <Route component={NotFoundPage} />
          </Switch>
        </AppShell>
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
