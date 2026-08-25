import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { transactionAPI } from "../../lib/api";
import { ArrowUpRight, ArrowDownLeft, MoreHorizontal } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

export default function RecentTransactions() {
  const { data: transactions, isLoading, error } = useQuery({
    queryKey: ["/api/transactions"],
    queryFn: () => transactionAPI.getTransactions(10),
  });

  const getTransactionIcon = (category?: string, amount?: string) => {
    if (!category || !amount) return '💳';
    
    const isIncome = parseFloat(amount) > 0;
    if (isIncome) return '💰';

    const iconMap: { [key: string]: string } = {
      'продукты': '🛒',
      'транспорт': '⛽',
      'развлечения': '🎬',
      'коммуналка': '🏠',
      'рестораны': '🍽️',
      'покупки': '🛍️',
      'здоровье': '🏥',
      'образование': '📚',
      'зарплата': '💰',
      'переводы': '💸',
    };
    
    return iconMap[category.toLowerCase()] || '💳';
  };

  const formatCurrency = (amount: string) => {
    const num = parseFloat(amount);
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(num);
  };

  const formatTransactionDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const transactionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (transactionDate.getTime() === today.getTime()) {
      return `Сегодня ${format(date, 'HH:mm')}`;
    } else if (transactionDate.getTime() === yesterday.getTime()) {
      return `Вчера ${format(date, 'HH:mm')}`;
    } else {
      return format(date, 'd MMM HH:mm', { locale: ru });
    }
  };

  const isIncome = (amount: string) => parseFloat(amount) > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground">
            Последние операции
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            className="text-primary hover:text-primary/80"
            data-testid="button-show-all-transactions"
          >
            Показать все
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3">
                <div className="flex items-center space-x-3">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-4">
            <p className="text-destructive">Ошибка загрузки транзакций</p>
          </div>
        ) : !transactions || transactions.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <MoreHorizontal className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">Транзакции отсутствуют</p>
            <p className="text-xs text-muted-foreground mt-1">
              Подключите банковские счета для отображения операций
            </p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="recent-transactions">
            {transactions.slice(0, 5).map((transaction) => (
              <div 
                key={transaction.id} 
                className="flex items-center justify-between p-3 hover:bg-muted rounded-lg cursor-pointer transition-colors"
                data-testid={`transaction-${transaction.id}`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center">
                    <span className="text-lg">
                      {getTransactionIcon(transaction.category, transaction.amount)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground" data-testid={`merchant-${transaction.id}`}>
                      {transaction.merchant || transaction.description}
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid={`details-${transaction.id}`}>
                      {transaction.category && (
                        <span className="capitalize">{transaction.category}</span>
                      )}
                      {transaction.category && ' • '}
                      {formatTransactionDate(transaction.transactionDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {isIncome(transaction.amount) ? (
                    <ArrowUpRight className="h-4 w-4 text-success" />
                  ) : (
                    <ArrowDownLeft className="h-4 w-4 text-destructive" />
                  )}
                  <span 
                    className={`font-semibold ${
                      isIncome(transaction.amount) 
                        ? 'text-success' 
                        : 'text-destructive'
                    }`}
                    data-testid={`amount-${transaction.id}`}
                  >
                    {isIncome(transaction.amount) ? '+' : ''}
                    {formatCurrency(transaction.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
