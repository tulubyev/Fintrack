/**
 * Выбор категории (E1.3-T9): поиск, «Частые» (по операциям пользователя за полгода), дерево и создание своей
 * категории прямо из поиска. На компьютере — всплывающий список у поля, на телефоне — панель снизу почти во весь экран.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCreateCategory } from '@/features/categories/api';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCategories, type CategoryNode } from './api';

const NONE = '__none__';

interface Props {
  /** undefined — ничего не выбрано (показывается placeholder), null — «Без категории». */
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  /** Для расхода — расходные категории, для дохода — доходные; без kind — все. */
  kind?: CategoryNode['kind'];
  placeholder?: string;
  testId?: string;
  /** Пункт «Без категории»; для массовой смены категории он не нужен. */
  allowNone?: boolean;
  /** Подпись пункта null: в бюджетах это «Общий бюджет». */
  noneLabel?: string;
}

const normalize = (value: string) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е');

const useFrequent = (kind: 'expense' | 'income' | undefined) =>
  useQuery({
    queryKey: ['v1', 'categories', 'frequent', kind],
    queryFn: () => api<{ ids: string[] }>('/api/v1/categories/frequent', { query: { kind: kind! } }),
    enabled: Boolean(kind),
    staleTime: 5 * 60_000,
  });

export function CategorySelect({ value, onChange, kind, placeholder = 'Без категории', testId, allowNone = true, noneLabel = 'Без категории' }: Props) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const categories = useCategories();
  const createCategory = useCreateCategory();
  const frequentKind = kind === 'expense' || kind === 'income' ? kind : undefined;
  const frequent = useFrequent(frequentKind);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const tree = (categories.data?.tree ?? []).filter((node) => !node.hidden && (!kind || node.kind === kind));
  const byId = categories.data?.byId;
  const label = value === undefined ? null : value === null ? noneLabel : byId?.get(value)?.fullName ?? null;
  const frequentItems = (frequent.data?.ids ?? []).map((id) => byId?.get(id)).filter((item) => item && (!kind || item.kind === kind));
  const query = search.trim();
  const exists = useMemo(
    () => tree.some((node) => normalize(node.name) === normalize(query) || node.children.some((child) => normalize(child.name) === normalize(query))),
    [tree, query],
  );

  function choose(next: string | null) {
    onChange(next);
    setOpen(false);
    setSearch('');
  }

  async function create() {
    if (!frequentKind) return;
    try {
      const created = await createCategory.mutateAsync({ name: query, kind: frequentKind, parentId: null });
      toast({ title: `Категория «${created.name}» создана`, description: 'Переместить её внутрь другой можно на экране «Категории».' });
      choose(created.id);
    } catch (error) {
      toast({ title: 'Не получилось', description: errorMessage(error), variant: 'destructive' });
    }
  }

  const list = (
    <Command filter={(itemValue, term, keywords) => (normalize([itemValue, ...(keywords ?? [])].join(' ')).includes(normalize(term)) ? 1 : 0)}>
      <CommandInput value={search} onValueChange={setSearch} placeholder="Найти категорию" data-testid={testId ? `${testId}-search` : undefined} />
      {!query && frequentItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b px-2 py-2" data-testid={testId ? `${testId}-frequent` : undefined}>
          <span className="w-full px-1 text-xs text-muted-foreground">Частые</span>
          {frequentItems.map((item) => (
            <button key={item!.id} type="button" onClick={() => choose(item!.id)}
              className={cn('rounded-full border px-2.5 py-1 text-xs hover:bg-accent', value === item!.id && 'border-primary text-primary')}>
              {item!.name}
            </button>
          ))}
        </div>
      )}
      <CommandList className={isMobile ? 'max-h-none flex-1' : 'max-h-72'}>
        <CommandEmpty>Ничего не нашлось</CommandEmpty>
        {allowNone && !query && (
          <CommandItem value={NONE} keywords={[noneLabel]} onSelect={() => choose(null)}>
            <Check className={cn(value === null ? 'opacity-100' : 'opacity-0')} />{noneLabel}
          </CommandItem>
        )}
        {tree.map((parent) => (
          <CommandGroup key={parent.id} heading={parent.children.length > 0 ? parent.name : undefined}>
            <CommandItem value={parent.id} keywords={[parent.name]} onSelect={() => choose(parent.id)}>
              <Check className={cn(value === parent.id ? 'opacity-100' : 'opacity-0')} />
              {parent.children.length > 0 ? `${parent.name} — всё` : parent.name}
            </CommandItem>
            {parent.children.filter((child) => !child.hidden).map((child) => (
              <CommandItem key={child.id} value={child.id} keywords={[child.name, parent.name]} onSelect={() => choose(child.id)} className="pl-6">
                <Check className={cn(value === child.id ? 'opacity-100' : 'opacity-0')} />{child.name}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        {frequentKind && query.length >= 2 && !exists && (
          <CommandGroup>
            <CommandItem value="__create__" keywords={[query]} onSelect={() => void create()} disabled={createCategory.isPending} data-testid={testId ? `${testId}-create` : undefined}>
              <Plus />Создать «{query}»
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );

  const trigger = (
    <Button type="button" variant="outline" role="combobox" aria-expanded={open} data-testid={testId}
      className="w-full justify-between px-3 font-normal" onClick={isMobile ? () => setOpen(true) : undefined}>
      <span className={cn('truncate', !label && 'text-muted-foreground')}>{label ?? placeholder}</span>
      <ChevronDown className="size-4 shrink-0 opacity-50" />
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(''); }}>
          <SheetContent side="bottom" className="flex h-[88dvh] flex-col gap-2 rounded-t-2xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <SheetHeader className="px-1 text-left">
              <SheetTitle>Категория</SheetTitle>
              <SheetDescription className="sr-only">Поиск, частые и все категории</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col [&_[cmdk-root]]:flex [&_[cmdk-root]]:min-h-0 [&_[cmdk-root]]:flex-1 [&_[cmdk-root]]:flex-col">{list}</div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch(''); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">{list}</PopoverContent>
    </Popover>
  );
}
