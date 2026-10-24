import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useSetMapping, type ColumnMapping, type ImportBatch } from './api';

const NONE = '__none__';
type Role = 'date' | 'description' | 'amount' | 'income' | 'expense' | 'currency' | 'mcc' | 'category';
const ROLE_LABELS: Record<Role, string> = {
  date: 'Дата', description: 'Описание', amount: 'Сумма', income: 'Приход', expense: 'Расход', currency: 'Валюта', mcc: 'MCC', category: 'Категория банка',
};
const DATE_FORMATS: Array<NonNullable<ColumnMapping['dateFormat']>> = ['DD.MM.YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'];

/**
 * Сопоставление колонок (E1.2-T15, шаг 3) для незнакомого CSV или Excel: какая колонка — дата, описание, сумма
 * (или приход и расход), формат даты, знак расходов. «Запомнить» — следующий файл с таким заголовком разберётся сам.
 */
export function MappingStep({ batch }: { batch: ImportBatch }) {
  const preview = batch.mappingPreview!;
  const suggested = batch.suggestedMapping ?? batch.columnMapping;
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>(suggested ?? { signConvention: 'signed' });
  const [remember, setRemember] = useState(true);
  const save = useSetMapping(batch.id);
  const split = mapping.signConvention === 'split';
  const roles: Role[] = ['date', 'description', ...(split ? (['income', 'expense'] as Role[]) : (['amount'] as Role[])), 'currency', 'mcc', 'category'];
  const columns = preview.header.map((name, index) => ({ name, index })).filter((column) => column.name);
  const used = new Map(roles.map((role) => [mapping[role] as string | undefined, role]));
  const ready = Boolean(mapping.date && mapping.description && (split ? mapping.income && mapping.expense : mapping.amount));

  const setRole = (role: Role, column: string) => setMapping((current) => ({ ...current, [role]: column === NONE ? undefined : column }));

  const submit = () => {
    if (!ready) return;
    const clean = Object.fromEntries(Object.entries(mapping).filter(([key, value]) => value !== undefined && (split ? key !== 'amount' : key !== 'income' && key !== 'expense')));
    save.mutate({ mapping: clean as unknown as ColumnMapping, remember });
  };

  return (
    <section className="rounded-xl border bg-card p-4 md:p-6" data-testid="import-mapping">
      <h2 className="font-semibold">Где в файле дата, сумма и описание?</h2>
      <p className="mt-1 text-sm text-muted-foreground">Мы не знаем этот формат. Укажите колонки один раз — дальше такие файлы будут распознаваться сами.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {roles.map((role) => (
          <div key={role} className="space-y-1">
            <Label>{ROLE_LABELS[role]}{['date', 'description', 'amount', 'income', 'expense'].includes(role) ? '' : ' (необязательно)'}</Label>
            <Select value={(mapping[role] as string | undefined) ?? NONE} onValueChange={(value) => setRole(role, value)}>
              <SelectTrigger data-testid={`mapping-${role}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Не использовать</SelectItem>
                {columns.map((column) => <SelectItem key={column.index} value={column.name}>{column.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ))}
        <div className="space-y-1">
          <Label>Формат даты</Label>
          <Select value={mapping.dateFormat ?? DATE_FORMATS[0]} onValueChange={(value) => setMapping((current) => ({ ...current, dateFormat: value as ColumnMapping['dateFormat'] }))}>
            <SelectTrigger data-testid="mapping-date-format"><SelectValue /></SelectTrigger>
            <SelectContent>{DATE_FORMATS.map((format) => <SelectItem key={format} value={format}>{format.replace('YYYY', 'ГГГГ').replace('MM', 'ММ').replace('DD', 'ДД')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-4">
        <Label>Как записаны расходы</Label>
        <RadioGroup value={mapping.signConvention ?? 'signed'} onValueChange={(value) => setMapping((current) => ({ ...current, signConvention: value as ColumnMapping['signConvention'] }))} className="mt-2 gap-2">
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="signed" data-testid="mapping-sign-signed" />Одна колонка суммы, расходы со знаком минус</label>
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="expense_positive" />Одна колонка, расходы без минуса, доходы с минусом</label>
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="split" data-testid="mapping-sign-split" />Приход и расход в разных колонках</label>
        </RadioGroup>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60">
            <tr>
              {preview.header.map((name, index) => (
                <th key={index} className={cn('whitespace-nowrap px-2 py-1.5 text-left font-medium', used.has(name) && 'bg-primary/10')}>
                  {name}
                  {used.get(name) && <div className="font-normal text-primary">{ROLE_LABELS[used.get(name)!]}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, 10).map((row, r) => (
              <tr key={r} className="border-t">
                {preview.header.map((name, c) => <td key={c} className={cn('max-w-48 truncate whitespace-nowrap px-2 py-1', used.has(name) && 'bg-primary/5')}>{row[c] ?? ''}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <Checkbox checked={remember} onCheckedChange={(value) => setRemember(value === true)} />
        Запомнить для файлов с такими же колонками
      </label>
      {save.isError && <p className="mt-3 text-sm text-destructive">{errorMessage(save.error)}</p>}
      <Button className="mt-4" disabled={!ready || save.isPending} onClick={submit} data-testid="mapping-submit">Распознать операции</Button>
    </section>
  );
}
