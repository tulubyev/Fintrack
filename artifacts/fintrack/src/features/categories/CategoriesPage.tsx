/**
 * Категории (E1.3-T2/T9): вкладки «Расходы», «Доходы», «Переводы»; дерево с иконками; у системных — «Скрыть» и
 * «Переименовать для себя», у своих — «Изменить» и «Удалить» с выбором, куда перенести операции.
 */
import { useState } from 'react';
import { Link } from 'wouter';
import { EyeOff, MoreHorizontal, Pencil, Plus, Sparkles, Trash2, Wand2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/layout/PageHeader';
import { ResponsiveDialog } from '@/components/ResponsiveDialog';
import { CategoryIcon } from '@/features/transactions/CategoryIcon';
import { CategorySelect } from '@/features/transactions/CategorySelect';
import type { CategoryNode, FlatCategory } from '@/features/transactions/api';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAllCategories, useCategorySettings, useCreateCategory, useDeleteCategory, useUpdateCategory, useUpdateCategorySettings } from './api';

type Kind = CategoryNode['kind'];
const TABS: { value: Kind; label: string }[] = [
  { value: 'expense', label: 'Расходы' },
  { value: 'income', label: 'Доходы' },
  { value: 'transfer', label: 'Переводы' },
];
const ROOT = 'root';

const flat = (node: CategoryNode, parent?: CategoryNode): FlatCategory => ({
  id: node.id, name: node.name, kind: node.kind, icon: node.icon ?? parent?.icon ?? null, color: node.color ?? parent?.color ?? null,
  parentId: parent?.id ?? null, fullName: parent ? `${parent.name} · ${node.name}` : node.name,
});

type Editing = { mode: 'create'; kind: 'expense' | 'income'; parentId: string | null } | { mode: 'edit'; node: CategoryNode; parentId: string | null };

/** Создание и правка своей категории, переименование системной «для себя». */
function CategoryForm({ editing, roots, onClose }: { editing: Editing | null; roots: CategoryNode[]; onClose: () => void }) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const { toast } = useToast();
  const node = editing?.mode === 'edit' ? editing.node : null;
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>(ROOT);
  const [error, setError] = useState<string | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);

  // заполняем форму при каждом открытии
  const key = editing ? (editing.mode === 'edit' ? editing.node.id : `new:${editing.parentId}`) : null;
  if (key !== lastKey) {
    setLastKey(key);
    setName(node?.name ?? '');
    setParentId(editing?.parentId ?? ROOT);
    setError(null);
  }

  const system = Boolean(node?.isSystem);
  const kind = editing?.mode === 'create' ? editing.kind : node?.kind;
  // подкатегорию с детьми нельзя вложить — тогда родителя не меняем
  const canMove = !system && !(node && node.children.length > 0);
  const parents = roots.filter((root) => root.kind === kind && root.id !== node?.id);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const trimmed = name.trim();
    if (!trimmed) return setError('Введите название');
    try {
      if (editing.mode === 'create') {
        await create.mutateAsync({ name: trimmed, kind: editing.kind, parentId: parentId === ROOT ? null : parentId });
        toast({ title: 'Категория добавлена' });
      } else if (system) {
        await update.mutateAsync({ id: editing.node.id, customName: trimmed });
        toast({ title: 'Категория переименована', description: 'Только для вас — у других пользователей прежнее название' });
      } else {
        await update.mutateAsync({ id: editing.node.id, name: trimmed, ...(canMove ? { parentId: parentId === ROOT ? null : parentId } : {}) });
        toast({ title: 'Изменения сохранены' });
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <ResponsiveDialog
      open={Boolean(editing)}
      onOpenChange={(open) => !open && onClose()}
      title={editing?.mode === 'create' ? 'Новая категория' : system ? 'Переименовать для себя' : 'Изменить категорию'}
    >
      <form onSubmit={submit} className="grid gap-4" noValidate data-testid="category-form">
        <div className="grid gap-2">
          <Label htmlFor="category-name">Название</Label>
          <Input id="category-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus aria-invalid={Boolean(error)} />
        </div>
        {canMove && (
          <div className="grid gap-2">
            <Label>Где</Label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger data-testid="category-parent"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={ROOT}>Отдельная категория верхнего уровня</SelectItem>
                {parents.map((parent) => <SelectItem key={parent.id} value={parent.id}>Внутри «{parent.name}»</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {system && node && (
          <Button type="button" variant="link" className="justify-start px-0" onClick={async () => { await update.mutateAsync({ id: node.id, customName: null }); onClose(); }}>
            Вернуть системное название
          </Button>
        )}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" disabled={create.isPending || update.isPending} data-testid="category-submit">
          {editing?.mode === 'create' ? 'Добавить' : 'Сохранить'}
        </Button>
      </form>
    </ResponsiveDialog>
  );
}

/** Удаление своей категории: операции, бюджеты и регулярные платежи переносятся в выбранную замену. */
function DeleteDialog({ node, onClose }: { node: CategoryNode | null; onClose: () => void }) {
  const remove = useDeleteCategory();
  const { toast } = useToast();
  const [replaceWithId, setReplaceWithId] = useState<string | null | undefined>(undefined);
  async function confirm() {
    if (!node || !replaceWithId) return;
    try {
      const result = await remove.mutateAsync({ id: node.id, replaceWithId });
      toast({ title: `Категория «${node.name}» удалена`, description: `Перенесено операций: ${result.movedTransactions}` });
      setReplaceWithId(undefined);
      onClose();
    } catch (error) {
      toast({ title: 'Не удалось удалить', description: errorMessage(error), variant: 'destructive' });
    }
  }
  return (
    <AlertDialog open={Boolean(node)} onOpenChange={(open) => { if (!open) { setReplaceWithId(undefined); onClose(); } }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить «{node?.name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Операции{node && node.children.length > 0 ? ', подкатегории' : ''} и бюджеты перейдут в выбранную категорию. Если у неё уже есть бюджет, бюджет удаляемой категории удалится.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <CategorySelect value={replaceWithId} onChange={setReplaceWithId} kind={node?.kind} allowNone={false} placeholder="Куда перенести операции" testId="category-replace" />
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => { event.preventDefault(); void confirm(); }}
            disabled={!replaceWithId || remove.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="category-delete-confirm"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Row({ node, parent, actions }: { node: CategoryNode; parent?: CategoryNode; actions: RowActions }) {
  const update = useUpdateCategory();
  const { toast } = useToast();
  const canHide = node.isSystem && node.kind !== 'transfer';
  async function toggleHidden(hidden: boolean) {
    try {
      await update.mutateAsync({ id: node.id, hidden });
    } catch (error) {
      toast({ title: 'Не получилось', description: errorMessage(error), variant: 'destructive' });
    }
  }
  return (
    <div className={cn('flex min-h-12 items-center gap-3 py-1.5', parent && 'pl-8', node.hidden && 'opacity-60')} data-testid="category-row" data-name={node.name}>
      <CategoryIcon category={flat(node, parent)} type={node.kind === 'income' ? 'income' : 'expense'} className="size-8" />
      <div className="flex min-w-0 flex-1 items-center">
        <span className="truncate" title={node.name}>{node.name}</span>
        {!node.isSystem && <Badge variant="secondary" className="ml-2 h-5 shrink-0 px-1.5 text-[11px]">Своя</Badge>}
        {node.hidden && <span className="ml-2 shrink-0 text-xs text-muted-foreground">скрыта</span>}
      </div>
      {canHide && (
        <Switch
          checked={!node.hidden}
          onCheckedChange={(visible) => void toggleHidden(!visible)}
          disabled={update.isPending}
          aria-label={node.hidden ? `Показывать «${node.name}»` : `Скрыть «${node.name}»`}
          data-testid="category-visible"
        />
      )}
      {node.kind !== 'transfer' && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 shrink-0" aria-label={`Действия с «${node.name}»`} data-testid="category-menu"><MoreHorizontal className="size-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!parent && <DropdownMenuItem onSelect={() => actions.onAddChild(node)}><Plus className="mr-2 size-4" />Подкатегория</DropdownMenuItem>}
            <DropdownMenuItem onSelect={() => actions.onEdit(node, parent ?? null)}><Pencil className="mr-2 size-4" />{node.isSystem ? 'Переименовать для себя' : 'Изменить'}</DropdownMenuItem>
            {canHide && (
              <DropdownMenuItem onSelect={() => void toggleHidden(!node.hidden)}><EyeOff className="mr-2 size-4" />{node.hidden ? 'Показывать' : 'Скрыть'}</DropdownMenuItem>
            )}
            {!node.isSystem && (
              <DropdownMenuItem onSelect={() => actions.onDelete(node)} className="text-destructive focus:text-destructive" data-testid="category-delete">
                <Trash2 className="mr-2 size-4" />Удалить
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

interface RowActions {
  onAddChild: (parent: CategoryNode) => void;
  onEdit: (node: CategoryNode, parent: CategoryNode | null) => void;
  onDelete: (node: CategoryNode) => void;
}

/** «Использовать нейросеть для категорий»: видно, только когда нейросеть включена на сервере (D2). */
function LlmSetting() {
  const settings = useCategorySettings();
  const update = useUpdateCategorySettings();
  const { toast } = useToast();
  if (!settings.data?.llmAvailable) return null;
  return (
    <label className="mb-4 flex items-start justify-between gap-4 rounded-xl border bg-card p-4" data-testid="llm-setting">
      <span className="flex gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          <span className="block font-medium">Нейросеть для неузнанных операций</span>
          <span className="block text-sm text-muted-foreground">
            Подбирает категорию по названию магазина. Отправляется только название без цифр и имён; переводы людям не отправляются.
          </span>
        </span>
      </span>
      <Switch
        checked={settings.data.llm}
        disabled={update.isPending}
        onCheckedChange={(value) => update.mutate(value, { onError: (error) => toast({ title: 'Не получилось', description: errorMessage(error), variant: 'destructive' }) })}
        aria-label="Нейросеть для неузнанных операций"
        data-testid="llm-switch"
      />
    </label>
  );
}

export function CategoriesPage() {
  const categories = useAllCategories();
  const [tab, setTab] = useState<Kind>('expense');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<CategoryNode | null>(null);
  const roots = categories.data?.items ?? [];
  const actions: RowActions = {
    onAddChild: (parent) => setEditing({ mode: 'create', kind: parent.kind as 'expense' | 'income', parentId: parent.id }),
    onEdit: (node, parent) => setEditing({ mode: 'edit', node, parentId: parent?.id ?? null }),
    onDelete: setDeleting,
  };

  return (
    <>
      <PageHeader
        title="Категории"
        description="Скройте лишние, переименуйте под себя или добавьте свои — например, «Собака» внутри «Животные»"
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href="/categories/rules" data-testid="rules-link"><Wand2 className="mr-2 size-4" />Правила</Link></Button>
            {tab !== 'transfer' && (
              <Button onClick={() => setEditing({ mode: 'create', kind: tab as 'expense' | 'income', parentId: null })} data-testid="add-category">
                <Plus className="mr-2 size-4" />Новая категория
              </Button>
            )}
          </div>
        )}
      />
      <LlmSetting />
      <Tabs value={tab} onValueChange={(value) => setTab(value as Kind)}>
        <TabsList>
          {TABS.map((item) => <TabsTrigger key={item.value} value={item.value} data-testid={`categories-tab-${item.value}`}>{item.label}</TabsTrigger>)}
        </TabsList>
        {TABS.map((item) => (
          <TabsContent key={item.value} value={item.value} className="mt-4">
            {categories.isPending ? <Skeleton className="h-96 rounded-xl" /> : categories.isError ? (
              <p className="rounded-xl border bg-card p-6 text-sm text-destructive">{errorMessage(categories.error)}</p>
            ) : (
              <div className="divide-y rounded-xl border bg-card px-4" data-testid={`categories-${item.value}`}>
                {roots.filter((root) => root.kind === item.value).map((root) => (
                  <div key={root.id} className="py-1">
                    <Row node={root} actions={actions} />
                    {root.children.map((child) => <Row key={child.id} node={child} parent={root} actions={actions} />)}
                  </div>
                ))}
              </div>
            )}
            {item.value === 'transfer' && <p className="mt-3 text-sm text-muted-foreground">Категории переводов системные: их нельзя скрыть или изменить.</p>}
          </TabsContent>
        ))}
      </Tabs>
      <CategoryForm editing={editing} roots={roots} onClose={() => setEditing(null)} />
      <DeleteDialog node={deleting} onClose={() => setDeleting(null)} />
    </>
  );
}
