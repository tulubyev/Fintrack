import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCategories, type CategoryNode } from './api';

const NONE = 'none';

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
}

export function CategorySelect({ value, onChange, kind, placeholder = 'Без категории', testId, allowNone = true }: Props) {
  const categories = useCategories();
  const tree = (categories.data?.tree ?? []).filter((node) => !node.hidden && (!kind || node.kind === kind));

  return (
    <Select value={value === undefined ? '' : value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
      <SelectTrigger data-testid={testId}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-80">
        {allowNone && <SelectItem value={NONE}>Без категории</SelectItem>}
        {tree.map((parent) => (
          <SelectGroup key={parent.id}>
            {parent.children.length > 0 && <SelectLabel>{parent.name}</SelectLabel>}
            <SelectItem value={parent.id}>{parent.children.length > 0 ? `${parent.name} — всё` : parent.name}</SelectItem>
            {parent.children.filter((child) => !child.hidden).map((child) => (
              <SelectItem key={child.id} value={child.id} className="pl-6">{child.name}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
