/**
 * Разбор «Без категории» (E1.3-T9): операции без категории, сгруппированные по мерчанту («ИП Сидоров: 3 операции,
 * 550 ₽»), с предложением нейросети. Категория ставится всей группе; «запомнить» — правило на будущие операции.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/api';
import { formatMoney } from '@workspace/shared/money';
import { CategorySelect } from './CategorySelect';
import { useApplyToGroup, useCategories, useUncategorizedGroups, type UncategorizedGroup } from './api';

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'операция' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'операции' : 'операций');

function GroupRow({ group }: { group: UncategorizedGroup }) {
  const categories = useCategories();
  const apply = useApplyToGroup();
  const { toast } = useToast();
  const [categoryId, setCategoryId] = useState<string | null | undefined>(undefined);
  const [remember, setRemember] = useState(Boolean(group.key));
  const suggested = group.suggestedCategoryId ? categories.data?.byId.get(group.suggestedCategoryId) : undefined;

  async function submit(target: string) {
    try {
      const result = await apply.mutateAsync({ key: group.key, type: group.type, categoryId: target, remember: remember && Boolean(group.key) });
      toast({
        title: `«${group.label}»: ${categories.data?.byId.get(target)?.fullName ?? 'категория'}`,
        description: `Размечено: ${result.updated}${result.ruleCreated ? '. Следующие такие операции получат категорию сами' : ''}`,
      });
    } catch (err) {
      toast({ title: 'Не получилось', description: errorMessage(err), variant: 'destructive' });
    }
  }

  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center" data-testid="review-group" data-key={group.key}>
      <div className="min-w-0">
        <p className="truncate font-medium" title={group.label}>{group.label}</p>
        <p className="text-sm text-muted-foreground">
          {group.count} {plural(group.count)} · {formatMoney(group.type === 'expense' ? `-${group.totalAmount}` : group.totalAmount, 'RUB', { signed: group.type === 'income' })}
        </p>
        {suggested && (
          <p className="mt-1 inline-flex items-center gap-1 text-sm" data-testid="review-suggestion">
            <Sparkles className="size-4 text-primary" aria-hidden />Похоже на «{suggested.fullName}»
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:w-72">
        {suggested && (
          <Button onClick={() => void submit(suggested.id)} disabled={apply.isPending} data-testid="review-accept">Принять</Button>
        )}
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <CategorySelect value={categoryId} onChange={setCategoryId} kind={group.type} allowNone={false} placeholder={suggested ? 'Другая категория' : 'Выбрать категорию'} testId="review-category" />
          </div>
          <Button variant={suggested ? 'outline' : 'default'} disabled={!categoryId || apply.isPending} onClick={() => categoryId && void submit(categoryId)} data-testid="review-apply">ОК</Button>
        </div>
        {group.key && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={remember} onCheckedChange={(value) => setRemember(value === true)} data-testid="review-remember" />
            Запомнить для будущих операций
          </label>
        )}
      </div>
    </div>
  );
}

export function ReviewPage() {
  const groups = useUncategorizedGroups();
  const tracked = useRef(false);
  useEffect(() => {
    if (groups.data && !tracked.current) {
      tracked.current = true;
      track('uncategorized_review_opened', { groups: groups.data.groups.length });
    }
  }, [groups.data]);

  return (
    <>
      <Link href="/transactions" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Операции</Link>
      <PageHeader title="Без категории" description={groups.data?.total ? `Операций без категории: ${groups.data.total}. Похожие собраны в группы — категория ставится всем сразу.` : undefined} />
      {groups.isPending ? <Skeleton className="h-64 rounded-xl" /> : groups.isError ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-destructive">{errorMessage(groups.error)}</p>
      ) : !groups.data.groups.length ? (
        <div className="rounded-xl border bg-card p-8 text-center" data-testid="review-empty">
          <CheckCircle2 className="mx-auto size-8 text-success" aria-hidden />
          <p className="mt-3 font-medium">Всё разобрано</p>
          <p className="mt-1 text-sm text-muted-foreground">У всех операций есть категория.</p>
          <Button asChild variant="outline" className="mt-4"><Link href="/transactions">К операциям</Link></Button>
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-card px-4" data-testid="review-list">
          {groups.data.groups.map((group) => <GroupRow key={`${group.type}|${group.key}`} group={group} />)}
        </div>
      )}
    </>
  );
}
