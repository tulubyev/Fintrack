import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { dashboardAPI } from "../../lib/api";
import { BarChart3 } from "lucide-react";

export default function SpendingChart() {
  const { data: categories, isLoading, error } = useQuery({
    queryKey: ["/api/dashboard/spending-categories"],
    queryFn: () => dashboardAPI.getSpendingCategories(),
  });

  const getCategoryColor = (index: number) => {
    const colors = [
      "hsl(var(--chart-1))",
      "hsl(var(--chart-2))", 
      "hsl(var(--chart-3))",
      "hsl(var(--chart-4))",
      "hsl(var(--chart-5))",
    ];
    return colors[index % colors.length];
  };

  const getCategoryIcon = (category: string) => {
    const iconMap: { [key: string]: string } = {
      'продукты': '🛒',
      'транспорт': '⛽',
      'развлечения': '🎬', 
      'коммуналка': '🏠',
      'рестораны': '🍽️',
      'покупки': '🛍️',
      'здоровье': '🏥',
      'образование': '📚',
      'прочее': '📊',
    };
    return iconMap[category.toLowerCase()] || '📊';
  };

  const formatCurrency = (amount: string) => {
    const num = Math.abs(parseFloat(amount));
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const calculatePercentage = (amount: string, total: number) => {
    if (total === 0) return 0;
    return (Math.abs(parseFloat(amount)) / total) * 100;
  };

  const totalExpenses = categories?.reduce((sum, cat) => sum + Math.abs(parseFloat(cat.total)), 0) || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Анализ трат
          </CardTitle>
          <div className="flex space-x-2">
            <Button 
              size="sm" 
              className="bg-primary text-primary-foreground text-xs"
              data-testid="button-chart-month"
            >
              Месяц
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-muted-foreground hover:text-foreground text-xs"
              data-testid="button-chart-week"
            >
              Неделя
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-muted-foreground hover:text-foreground text-xs"
              data-testid="button-chart-year"
            >
              Год
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Mock Chart Area */}
        <div className="chart-container mb-6">
          <div className="w-full h-64 bg-muted rounded-lg flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <BarChart3 className="h-8 w-8 text-primary" />
              </div>
              <p className="text-muted-foreground font-medium">График динамики трат</p>
              <p className="text-xs text-muted-foreground mt-1">
                Интерактивная визуализация будет добавлена
              </p>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="space-y-4">
          <h4 className="font-medium text-foreground">Расходы по категориям</h4>
          
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-4">
              <p className="text-destructive">Ошибка загрузки категорий</p>
            </div>
          ) : !categories || categories.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                <BarChart3 className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Данные о тратах отсутствуют</p>
              <p className="text-xs text-muted-foreground mt-1">
                Подключите банковские счета для анализа
              </p>
            </div>
          ) : (
            <div className="space-y-4" data-testid="spending-categories">
              {categories.slice(0, 5).map((category, index) => {
                const percentage = calculatePercentage(category.total, totalExpenses);
                return (
                  <div key={category.category} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: getCategoryColor(index) }}
                        />
                        <span className="text-sm font-medium flex items-center gap-2">
                          <span>{getCategoryIcon(category.category)}</span>
                          <span className="capitalize" data-testid={`category-${category.category}`}>
                            {category.category}
                          </span>
                        </span>
                      </div>
                      <span 
                        className="text-sm font-semibold"
                        data-testid={`amount-${category.category}`}
                      >
                        {formatCurrency(category.total)}
                      </span>
                    </div>
                    <Progress 
                      value={percentage} 
                      className="h-2"
                      style={{
                        backgroundColor: 'hsl(var(--muted))',
                      }}
                      data-testid={`progress-${category.category}`}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
