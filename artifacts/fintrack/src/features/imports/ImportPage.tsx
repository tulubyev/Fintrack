import { useRef, useState, type DragEvent } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { CheckCircle2, FileUp, Loader2, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/PageHeader';
import { errorMessage } from '@/lib/api';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { formatDate } from '@workspace/shared/money';
import { AccountIcon } from '@/features/accounts/AccountIcon';
import { useAccount } from '@/features/accounts/api';
import { BANK_GUIDES } from './guides';
import { uploadStatement, useRecentImports, type ImportBatch } from './api';
import { STATUS_LABELS } from './labels';

type Queued = { name: string; state: 'uploading' | 'done' | 'error'; id?: string; message?: string };

/**
 * Импорт выписки, шаг 1 (E1.2-T15): банк и инструкция «как скачать», загрузка одного или нескольких файлов.
 * Один файл — сразу к его разбору (/import/:id), несколько — список со статусом каждого.
 * Со страницы счёта (?accountId= или ?account=) банк и счёт выбраны заранее.
 */
export function ImportPage() {
  const params = new URLSearchParams(useSearch());
  const presetAccountId = params.get('accountId') ?? params.get('account') ?? undefined;
  const presetAccount = useAccount(presetAccountId ?? '');
  const [, navigate] = useLocation();
  const [bank, setBank] = useState<string | null>(null);
  const [queue, setQueue] = useState<Queued[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const recent = useRecentImports();

  const account = presetAccountId ? presetAccount.data : undefined;
  const bankCode = bank ?? account?.institutionCode ?? null;
  const guide = BANK_GUIDES.find((item) => item.code === bankCode);

  const chooseBank = (code: string) => {
    setBank(code);
    track('import_instructions_opened', { institution: code });
  };

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setQueue(files.map((file) => ({ name: file.name, state: 'uploading' })));
    const results: Queued[] = [];
    for (const file of files) {
      try {
        const batch = await uploadStatement(file, { accountId: presetAccountId, institutionCode: bankCode ?? undefined });
        results.push({ name: file.name, state: 'done', id: batch.id });
      } catch (error) {
        results.push({ name: file.name, state: 'error', message: errorMessage(error) });
      }
      setQueue([...results, ...files.slice(results.length).map((rest) => ({ name: rest.name, state: 'uploading' as const }))]);
    }
    if (files.length === 1 && results[0].id) navigate(`/import/${results[0].id}`);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void upload([...event.dataTransfer.files]);
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Загрузка выписки" description="Операции за 3–12 месяцев за пару минут: без дублей и с категориями." />

      {account && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border bg-card p-3 text-sm" data-testid="import-preset-account">
          <AccountIcon account={account} className="size-8" />
          <span>Выписка для счёта <b>{account.name}</b>{account.lastFour ? ` •• ${account.lastFour}` : ''}</span>
        </div>
      )}

      <section className="rounded-xl border bg-card p-4 md:p-6">
        <h2 className="font-semibold">1. Выберите банк</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BANK_GUIDES.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() => chooseBank(item.code)}
              className={cn('flex items-center gap-2 rounded-lg border p-2.5 text-left text-sm font-medium transition-colors hover:bg-muted', bankCode === item.code && 'border-primary bg-primary/5')}
              data-testid={`import-bank-${item.code}`}
            >
              <AccountIcon account={{ kind: 'debit_card', institutionCode: item.code === 'other' ? null : item.code }} className="size-7" />
              {item.name}
            </button>
          ))}
        </div>
        {guide && (
          <div className="mt-4 rounded-lg bg-muted/60 p-4 text-sm" data-testid="import-guide">
            <div className="font-medium">Как скачать выписку — {guide.name}</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {guide.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
            {guide.recommended && <p className={cn('mt-3', guide.supported ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400')}>{guide.recommended}</p>}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-xl border bg-card p-4 md:p-6">
        <h2 className="font-semibold">2. Загрузите файл</h2>
        <div
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn('mt-3 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors', dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25')}
        >
          <FileUp className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm">Перетащите сюда CSV или Excel (XLSX) — можно несколько файлов, до 15 МБ каждый</p>
          <Button onClick={() => input.current?.click()} disabled={queue.some((item) => item.state === 'uploading')} data-testid="import-choose-files">
            <Upload className="mr-2 size-4" />Выбрать файлы
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            accept=".csv,.xlsx,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            data-testid="import-file-input"
            onChange={(event) => {
              void upload([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
        </div>
        {queue.length > 0 && (
          <ul className="mt-4 divide-y rounded-lg border" data-testid="import-queue">
            {queue.map((item, index) => (
              <li key={`${item.name}-${index}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                {item.state === 'uploading' && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                {item.state === 'done' && <CheckCircle2 className="size-4 text-emerald-600" />}
                {item.state === 'error' && <XCircle className="size-4 text-destructive" />}
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {item.state === 'error' && <span className="text-destructive">{item.message}</span>}
                {item.id && <Link href={`/import/${item.id}`} className="font-medium underline underline-offset-2">Открыть</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {recent.data && recent.data.items.length > 0 && (
        <section className="mt-6" data-testid="import-recent">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Последние загрузки</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {recent.data.items.map((batch) => <RecentRow key={batch.id} batch={batch} />)}
          </ul>
        </section>
      )}
    </div>
  );
}

function RecentRow({ batch }: { batch: ImportBatch }) {
  return (
    <li>
      <Link href={`/import/${batch.id}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/60">
        <span className="min-w-0 flex-1 truncate font-medium">{batch.fileName}</span>
        <span className="text-muted-foreground">{formatDate(batch.createdAt.slice(0, 10))}</span>
        <span className="w-36 text-right text-muted-foreground">{STATUS_LABELS[batch.status]}</span>
      </Link>
    </li>
  );
}
