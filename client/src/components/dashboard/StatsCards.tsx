import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardAPI } from "../../lib/api";
import { TrendingUp, TrendingDown, Wallet, Target } from "lucide-react";

export default function StatsCards() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ["/api/dashboard/stats"],
    queryFn: () => dashboardAPI.getStats(),
  });

  if (isLoading) {
    return (
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24 mb-4" />
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </section>
    );
  }

  if (error) {
    return (
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-destructive">Ошибка загрузки данных</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const calculateMonthlyChange = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  // Mock previous month data for percentage calculations
  const mockPreviousMonthIncome = stats ? stats.monthlyIncome * 0.92 : 0;
  const mockPreviousMonthExpenses = stats ? stats.monthlyExpenses * 0.87 : 0;

  const incomeChange = stats ? calculateMonthlyChange(stats.monthlyIncome, mockPreviousMonthIncome) : 0;
  const expenseChange = stats ? calculateMonthlyChange(stats.monthlyExpenses, mockPreviousMonthExpenses) : 0;

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Total Balance Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Общий баланс</h3>
            <Wallet className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <p className="text-3xl font-bold text-foreground" data-testid="text-total-balance">
              {stats ? formatCurrency(stats.totalBalance) : '0 ₽'}
            </p>
            <p className="text-sm text-success">+12,450 ₽ за месяц</p>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Income Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Доходы за месяц</h3>
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <p className="text-3xl font-bold text-foreground" data-testid="text-monthly-income">
              {stats ? formatCurrency(stats.monthlyIncome) : '0 ₽'}
            </p>
            <p className={`text-sm ${incomeChange >= 0 ? 'text-success' : 'text-destructive'}`}>
              {incomeChange >= 0 ? '+' : ''}{incomeChange.toFixed(1)}% к прошлому месяцу
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Expenses Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Расходы за месяц</h3>
            <TrendingDown className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <p className="text-3xl font-bold text-foreground" data-testid="text-monthly-expenses">
              {stats ? formatCurrency(stats.monthlyExpenses) : '0 ₽'}
            </p>
            <p className={`text-sm ${expenseChange <= 0 ? 'text-success' : 'text-destructive'}`}>
              {expenseChange >= 0 ? '+' : ''}{expenseChange.toFixed(1)}% к прошлому месяцу
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Savings Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Накопления</h3>
            <Target className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="space-y-2">
            <p className="text-3xl font-bold text-foreground" data-testid="text-total-savings">
              {stats ? formatCurrency(stats.totalSavings) : '0 ₽'}
            </p>
            <p className="text-sm text-accent">
              {stats ? stats.savingsGoalsCount : 0} активные цели
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
