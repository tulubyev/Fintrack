/**
 * Правила категорий (E1.3-T9): «Если мерчант = „пятерочка“ → Продукты» с числом срабатываний, создание с предпросмотром
 * совпадений, смена категории и удаление. Правила появляются сами, когда пользователь исправляет категорию операции.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import { CategoryIcon } from '@/features/transactions/CategoryIcon';
import { CategorySelect } from '@/features/transactions/CategorySelect';
import { useCategories } from '@/features/transactions/api';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { useCreateRule, useDeleteRule, useRulePreview, useRules, useUpdateRule, type CategoryRule, type RuleField, type RuleOp } from './api';

const FIELDS: Record<RuleField, string> = { merchant: 'мерчант', description: 'описание', mcc: 'MCC' };
const OPS: Record<RuleOp, string> = { equals: '=', contains: 'содержит', starts_with: 'начинается с' };

/** Значение после паузы в наборе — чтобы предпросмотр не дёргал API на каждую букву. */
function useDebounced<T>(value: T, ms = 400): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

function RuleDialog({ rule, open, onClose }: { rule: CategoryRule | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const create = useCreateRule();
  const update = useUpdateRule();
  const [field, setField] = useState<RuleField>('merchant');
  const [op, setOp] = useState<RuleOp>('contains');
  const [pattern, setPattern] = useState('');
  const [direction, setDirection] = useState<'in' | 'out'>('out');
  const [categoryId, setCategoryId] = useState<string | null | undefined>(undefined);
  const [past, setPast] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setField(rule?.field ?? 'merchant');
    setOp(rule?.op ?? 'contains');
    setPattern(rule?.pattern ?? '');
    setDirection(rule?.direction ?? 'out');
    setCategoryId(rule?.categoryId);
    setPast(!rule);
    setError(null);
  }, [open, rule]);

  const condition = useDebounced(pattern.trim().length >= 2 ? { field, op, pattern: pattern.trim(), direction } : null);
  const preview = useRulePreview(open ? condition : null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pattern.trim().length < 2) { setError('Шаблон — хотя бы два символа'); return; }
    if (!categoryId) { setError('Выберите категорию'); return; }
    const input = { field, op, pattern: pattern.trim(), direction, categoryId, apply: past ? 'future_and_past' as const : 'future' as const };
    try {
      const affected = rule ? (await update.mutateAsync({ id: rule.id, ...input })).affectedCount : (await create.mutateAsync(input)).affectedCount;
      toast({ title: rule ? 'Правило изменено' : 'Правило создано', description: past ? `Изменено прошлых операций: ${affected}` : undefined });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={(value) => !value && onClose()} title={rule ? 'Изменить правило' : 'Новое правило'}
      description="Подходящие операции получат категорию автоматически. Категории, выбранные вручную, правила не меняют.">
      <form onSubmit={submit} className="grid gap-4" noValidate data-testid="rule-form">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Если</Label>
            <Select value={field} onValueChange={(value) => { setField(value as RuleField); if (value === 'mcc') setOp('equals'); }}>
              <SelectTrigger data-testid="rule-field"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(FIELDS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Условие</Label>
            <Select value={op} onValueChange={(value) => setOp(value as RuleOp)} disabled={field === 'mcc'}>
              <SelectTrigger data-testid="rule-op"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(OPS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="rule-pattern">{field === 'mcc' ? 'Код MCC' : 'Текст'}</Label>
          <Input id="rule-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} maxLength={200}
            inputMode={field === 'mcc' ? 'numeric' : 'text'} placeholder={field === 'mcc' ? '5411' : 'Например, пятёрочка'} />
          <p className="text-xs text-muted-foreground" data-testid="rule-preview">
            {!condition ? 'Регистр и знаки препинания не важны' : preview.isPending ? 'Ищем совпадения…' : preview.isError ? errorMessage(preview.error) : `Подходит операций: ${preview.data.matchCount}`}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Операции</Label>
            <Select value={direction} onValueChange={(value) => { setDirection(value as 'in' | 'out'); setCategoryId(undefined); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="out">Списания</SelectItem><SelectItem value="in">Поступления</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Категория</Label>
            <CategorySelect value={categoryId} onChange={setCategoryId} kind={direction === 'out' ? 'expense' : 'income'} allowNone={false} placeholder="Выберите" testId="rule-category" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={past} onCheckedChange={(value) => setPast(value === true)} data-testid="rule-past" />
          Применить и к прошлым операциям
        </label>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" disabled={create.isPending || update.isPending} data-testid="rule-submit">{rule ? 'Сохранить' : 'Создать правило'}</Button>
      </form>
    </ResponsiveDialog>
  );
}

export function RulesPage() {
  const rules = useRules();
  const categories = useCategories();
  const remove = useDeleteRule();
  const { toast } = useToast();
  const [editing, setEditing] = useState<{ rule: CategoryRule | null } | null>(null);
  const items = rules.data?.items ?? [];

  async function destroy(rule: CategoryRule) {
    try {
      await remove.mutateAsync(rule.id);
      toast({ title: 'Правило удалено', description: 'Уже размеченные операции остаются в своих категориях.' });
    } catch (err) {
      toast({ title: 'Не получилось', description: errorMessage(err), variant: 'destructive' });
    }
  }

  return (
    <>
      <Link href="/categories" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />Категории</Link>
      <PageHeader
        title="Правила категорий"
        description="Операции, подходящие под правило, получают категорию автоматически"
        actions={<Button onClick={() => setEditing({ rule: null })} data-testid="add-rule"><Plus className="mr-2 size-4" />Создать правило</Button>}
      />
      {rules.isPending ? <Skeleton className="h-64 rounded-xl" /> : rules.isError ? (
        <p className="rounded-xl border bg-card p-6 text-sm text-destructive">{errorMessage(rules.error)}</p>
      ) : !items.length ? (
        <div className="rounded-xl border bg-card p-8 text-center" data-testid="rules-empty">
          <Wand2 className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-medium">Правил пока нет</p>
          <p className="mt-1 text-sm text-muted-foreground">Правила появятся, когда вы исправите категорию операции. Можно создать вручную.</p>
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-card px-4" data-testid="rules-list">
          {items.map((rule) => {
            const category = categories.data?.byId.get(rule.categoryId);
            return (
              <div key={rule.id} className="flex min-h-14 items-center gap-3 py-2" data-testid="rule-row">
                <CategoryIcon category={category} type={rule.direction === 'in' ? 'income' : 'expense'} className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    Если {FIELDS[rule.field]} {OPS[rule.op]} «{rule.pattern}» → <span className="font-medium">{category?.fullName ?? 'скрытая категория'}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {rule.direction === 'in' ? 'поступления' : rule.direction === 'out' ? 'списания' : 'все операции'} · сработало {rule.hitCount}
                    {rule.source === 'correction' && <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[11px]">из исправления</Badge>}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Действия с правилом «${rule.pattern}»`} data-testid="rule-menu"><MoreHorizontal className="size-4" /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditing({ rule })}><Pencil className="mr-2 size-4" />Изменить</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void destroy(rule)} className="text-destructive"><Trash2 className="mr-2 size-4" />Удалить</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}
      <RuleDialog rule={editing?.rule ?? null} open={Boolean(editing)} onClose={() => setEditing(null)} />
    </>
  );
}
