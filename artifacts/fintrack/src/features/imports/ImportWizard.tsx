import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, CheckCircle2, Loader2, Undo2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@workspace/shared/money';
import { useCancelImport, useImport, useInvalidateAfterImport, useUndoImport, type ImportBatch } from './api';
import { MappingStep } from './MappingStep';
import { PreviewStep, plural } from './PreviewStep';

/** Один импорт по шагам (E1.2-T15): разбор → сопоставление колонок → счёт и предпросмотр → сохранение → итог и отмена. */
export function ImportWizard({ id }: { id: string }) {
  const batch = useImport(id);
  const invalidate = useInvalidateAfterImport(id);
  const previous = useRef<string | undefined>(undefined);

  // коммит закончился — счета, лента и бюджеты устарели
  useEffect(() => {
    const status = batch.data?.status;
    if (previous.current === 'committing' && status === 'done') void invalidate();
    previous.current = status;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate новый на каждом рендере, важен только переход статуса
  }, [batch.data?.status]);

  let content;
  if (batch.isPending) content = <Skeleton className="h-40 w-full rounded-xl" />;
  else if (batch.isError) content = <Problem title="Импорт не найден" text={errorMessage(batch.error)} />;
  else {
    const data = batch.data;
    switch (data.status) {
      case 'uploaded':
      case 'parsing':
        content = <Progress text="Читаем выписку…" fileName={data.fileName} />;
        break;
      case 'committing':
        content = <Progress text="Сохраняем операции…" fileName={data.fileName} />;
        break;
      case 'needs_mapping':
        content = <MappingStep batch={data} />;
        break;
      case 'preview':
        content = <PreviewStep key={data.id} batch={data} />;
        break;
      case 'done':
        content = <Done batch={data} />;
        break;
      case 'failed':
        content = <Problem title="Не удалось прочитать выписку" text={data.errorMessage ?? 'Попробуйте загрузить файл ещё раз.'} />;
        break;
      case 'undone':
        content = <Problem title="Импорт отменён" text={`Операции из файла «${data.fileName}» удалены.`} />;
        break;
      case 'cancelled':
        content = <Problem title="Загрузка удалена" text="Файл и разобранные строки удалены." />;
        break;
    }
  }

  const status = batch.data?.status;
  const cancellable = status === 'needs_mapping' || status === 'preview' || status === 'failed';
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Загрузка выписки" description={batch.data?.fileName} actions={cancellable ? <CancelButton id={id} /> : undefined} />
      {content}
    </div>
  );
}

function Progress({ text, fileName }: { text: string; fileName: string }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center" data-testid="import-progress" aria-live="polite">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="font-medium">{text}</p>
      <p className="text-sm text-muted-foreground">{fileName}</p>
    </section>
  );
}

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-xl border bg-card p-6 text-center" data-testid="import-problem">
      <AlertTriangle className="mx-auto size-8 text-warning" aria-hidden />
      <p className="mt-2 font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      <Button asChild className="mt-4"><Link href="/import">Загрузить другой файл</Link></Button>
    </section>
  );
}

function CancelButton({ id }: { id: string }) {
  const cancel = useCancelImport(id);
  const [, navigate] = useLocation();
  return (
    <Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(undefined, { onSuccess: () => navigate('/import') })} data-testid="import-cancel">
      Удалить загрузку
    </Button>
  );
}

function Done({ batch }: { batch: ImportBatch }) {
  const undo = useUndoImport(batch.id);
  const [confirm, setConfirm] = useState(false);
  const imported = batch.stats.imported ?? 0;
  const period = batch.periodFrom && batch.periodTo ? ` за ${formatDate(batch.periodFrom)} — ${formatDate(batch.periodTo)}` : '';
  const diff = batch.balanceCheck && batch.balanceCheck.diff !== '0.00' ? batch.balanceCheck : null;
  const undoable = batch.committedAt && Date.now() - Date.parse(batch.committedAt) < 30 * 86_400_000;

  return (
    <section className="rounded-xl border bg-card p-6" data-testid="import-done">
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
        <h2 className="mt-2 text-lg font-semibold">Загружено {imported} {plural(imported, 'операция', 'операции', 'операций')}{period}</h2>
        {(batch.stats.duplicate ?? 0) > 0 && <p className="mt-1 text-sm text-muted-foreground">Уже были в FinTrack и пропущены: {batch.stats.duplicate}</p>}
      </div>
      {diff && (
        <p className="mt-4 rounded-lg bg-warning-subtle p-3 text-sm text-warning" data-testid="import-balance-diff">
          Остаток в выписке — {formatMoney(diff.statementClosing)}, а у счёта получился {formatMoney(diff.computedClosing)}. Проверьте остаток на странице счёта.
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild><Link href="/transactions">Посмотреть траты</Link></Button>
        <Button asChild variant="outline"><Link href="/import">Загрузить ещё выписку</Link></Button>
        {undoable && (
          <Button variant="ghost" onClick={() => setConfirm(true)} data-testid="import-undo"><Undo2 className="mr-2 size-4" />Отменить импорт</Button>
        )}
      </div>
      {undo.isError && <p className="mt-3 text-center text-sm text-destructive">{errorMessage(undo.error)}</p>}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить импорт?</AlertDialogTitle>
            <AlertDialogDescription>
              {imported} {plural(imported, 'операция', 'операции', 'операций')} из этого файла будут удалены, остаток счёта пересчитается.
              {batch.editedCount ? ` Вы уже правили ${batch.editedCount} из них — правки тоже пропадут.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Не отменять</AlertDialogCancel>
            <AlertDialogAction onClick={() => undo.mutate()} data-testid="import-undo-confirm">Отменить импорт</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
