import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { savingsAPI } from "../../lib/api";
import { queryClient } from "../../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Target, Plus, TrendingUp } from "lucide-react";

export default function SavingsGoals() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newGoal, setNewGoal] = useState({
    name: "",
    description: "",
    targetAmount: "",
    targetDate: "",
  });

  const { data: goals, isLoading, error } = useQuery({
    queryKey: ["/api/savings-goals"],
    queryFn: () => savingsAPI.getGoals(),
  });

  const createGoalMutation = useMutation({
    mutationFn: savingsAPI.createGoal,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/savings-goals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setIsDialogOpen(false);
      setNewGoal({ name: "", description: "", targetAmount: "", targetDate: "" });
      toast({
        title: "Цель создана",
        description: "Новая финансовая цель успешно добавлена",
      });
    },
    onError: (error) => {
      toast({
        title: "Ошибка создания цели",
        description: error instanceof Error ? error.message : "Произошла ошибка",
        variant: "destructive",
      });
    },
  });

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGoal.name || !newGoal.targetAmount) {
      toast({
        title: "Заполните обязательные поля",
        description: "Название и целевая сумма обязательны",
        variant: "destructive",
      });
      return;
    }

    createGoalMutation.mutate(newGoal);
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(parseFloat(amount));
  };

  const calculateProgress = (current: string, target: string) => {
    const currentAmount = parseFloat(current);
    const targetAmount = parseFloat(target);
    if (targetAmount === 0) return 0;
    return Math.min((currentAmount / targetAmount) * 100, 100);
  };

  const getGoalIcon = (goalName: string) => {
    const name = goalName.toLowerCase();
    if (name.includes('отпуск') || name.includes('путешеств')) return '✈️';
    if (name.includes('машин') || name.includes('авто')) return '🚗';
    if (name.includes('дом') || name.includes('квартир')) return '🏠';
    if (name.includes('телефон') || name.includes('iphone')) return '📱';
    if (name.includes('подушка') || name.includes('безопасност')) return '🛡️';
    if (name.includes('образован') || name.includes('учеб')) return '📚';
    return '🎯';
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Target className="h-5 w-5" />
            Копилки
          </CardTitle>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="ghost" 
                size="sm"
                className="text-primary hover:text-primary/80"
                data-testid="button-create-goal"
              >
                <Plus className="h-4 w-4 mr-1" />
                Новая цель
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Создать финансовую цель</DialogTitle>
                <DialogDescription>
                  Добавьте новую цель для накоплений
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateGoal} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="goal-name">Название цели *</Label>
                  <Input
                    id="goal-name"
                    placeholder="Например, Отпуск в Турции"
                    value={newGoal.name}
                    onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
                    required
                    data-testid="input-goal-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal-description">Описание</Label>
                  <Textarea
                    id="goal-description"
                    placeholder="Подробнее о цели..."
                    value={newGoal.description}
                    onChange={(e) => setNewGoal({ ...newGoal, description: e.target.value })}
                    data-testid="input-goal-description"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal-amount">Целевая сумма *</Label>
                  <Input
                    id="goal-amount"
                    type="number"
                    placeholder="100000"
                    value={newGoal.targetAmount}
                    onChange={(e) => setNewGoal({ ...newGoal, targetAmount: e.target.value })}
                    required
                    data-testid="input-goal-amount"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="goal-date">Дата достижения</Label>
                  <Input
                    id="goal-date"
                    type="date"
                    value={newGoal.targetDate}
                    onChange={(e) => setNewGoal({ ...newGoal, targetDate: e.target.value })}
                    data-testid="input-goal-date"
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                    data-testid="button-cancel-goal"
                  >
                    Отмена
                  </Button>
                  <Button 
                    type="submit"
                    disabled={createGoalMutation.isPending}
                    data-testid="button-save-goal"
                  >
                    {createGoalMutation.isPending ? "Создание..." : "Создать"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-12" />
                </div>
                <Skeleton className="h-2 w-full" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-4">
            <p className="text-destructive">Ошибка загрузки целей</p>
          </div>
        ) : !goals || goals.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
              <Target className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">Нет активных целей</p>
            <p className="text-xs text-muted-foreground mt-1">
              Создайте первую цель для накоплений
            </p>
          </div>
        ) : (
          <div className="space-y-6" data-testid="savings-goals">
            {goals.slice(0, 5).map((goal) => {
              const progress = calculateProgress(goal.currentAmount, goal.targetAmount);
              return (
                <div key={goal.id} className="space-y-3" data-testid={`goal-${goal.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getGoalIcon(goal.name)}</span>
                      <span className="font-medium text-foreground" data-testid={`goal-name-${goal.id}`}>
                        {goal.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground" data-testid={`goal-progress-${goal.id}`}>
                        {progress.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <Progress 
                    value={progress} 
                    className="h-2"
                    data-testid={`goal-progress-bar-${goal.id}`}
                  />
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground" data-testid={`goal-current-${goal.id}`}>
                      {formatCurrency(goal.currentAmount)}
                    </span>
                    <span className="text-muted-foreground" data-testid={`goal-target-${goal.id}`}>
                      из {formatCurrency(goal.targetAmount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
