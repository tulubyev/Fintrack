/**
 * Карточка регулярного платежа (E1.6-T4): суммы по месяцам, последние списания, «Как отменить» из справочника,
 * напоминание за N дней, «Отметить отменённой» и «Это не подписка».
 */
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { track } from '@/lib/analytics';
import { errorMessage } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/money';
import { KIND_LABELS, scheduleText, useSeries, useUpdateSeries, type RecurringSeries, type SeriesPatch } from './api';

const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const STATUS_TOASTS: Record<NonNullable<SeriesPatch['status']>, string> = {
  confirmed: 'Отметили как регулярный платёж',
  ignored: 'Больше не покажем этот платёж',
  cancelled: 'Отметили отменённой — напомним, если спишут снова',
};

/** Смена статуса с тостом — общая для карточки и блока новых серий. */
export function useSeriesStatus() {
  const update = useUpdateSeries();
  const { toast } = useToast();
  return {
    isPending: update.isPending,
    async set(series: Pick<RecurringSeries, 'id'>, status: NonNullable<SeriesPatch['status']>) {
      try {
        await update.mutateAsync({ id: series.id, status });
        toast({ title: STATUS_TOASTS[status] });
        return true;
      } catch (error) {
        toast({ title: 'Не получилось', description: errorMessage(error), variant: 'destructive' });
        return false;
      }
    },
  };
}

function CancelGuide({ series }: { series: RecurringSeries }) {
  const service = series.service;
  if (!service?.cancelSteps && !service?.cancelUrl) return null;
  return (
    <section className="space-y-2" data-testid="cancel-guide">
      <h3 className="text-sm font-semibold">Как отменить</h3>
      {service.cancelSteps && <p className="whitespace-pre-line text-sm">{service.cancelSteps}</p>}
      {!service.verified && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="cancel-guide-unverified">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Инструкция может устареть — сервисы меняют меню. Если шаги не совпадают, ищите «Подписка» или «Управление подпиской» в профиле.
        </p>
      )}
      {service.cancelUrl && (
        <Button asChild variant="outline" size="sm">
          <a
            href={service.cancelUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('recurring_cancel_guide_opened', { service_code: service.code })}
            data-testid="cancel-link"
          >
            <ExternalLink className="mr-2 size-4" />Открыть страницу отмены
          </a>
        </Button>
      )}
    </section>
  );
}

export function SeriesSheet({ seriesId, onClose }: { seriesId: string | null; onClose: () => void }) {
  const isMobile = useIsMobile();
  const series = useSeries(seriesId);
  const update = useUpdateSeries();
  const status = useSeriesStatus();
  const { toast } = useToast();
  const data = series.data;

  async function setStatus(next: NonNullable<SeriesPatch['status']>) {
    if (!data) return;
    // «это не подписка» убирает серию из списка — закрываем карточку
    if (await status.set(data, next) && next === 'ignored') onClose();
  }

  async function setRemind(days: number) {
    if (!data) return;
    try {
      await update.mutateAsync({ id: data.id, remindDaysBefore: days });
    } catch (error) {
      toast({ title: 'Не получилось', description: errorMessage(error), variant: 'destructive' });
    }
  }

  const chart = data?.transactions
    .slice()
    .reverse()
    .map((tx) => ({ label: `${Number(tx.date.slice(8, 10))} ${SHORT_MONTHS[Number(tx.date.slice(5, 7)) - 1]}`, amount: Math.abs(Number(tx.amount)), raw: tx.amount.replace('-', '') }));
  const out = data?.direction === 'out';

  return (
    <Sheet open={Boolean(seriesId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className={isMobile ? 'w-full max-w-none overflow-y-auto' : 'w-[440px] overflow-y-auto sm:max-w-[440px]'} data-testid="series-sheet">
        {!data ? (
          <div className="space-y-3" aria-busy="true">
            {series.isError ? <p className="text-sm text-destructive">{errorMessage(series.error)}</p> : (
              <>
                <Skeleton className="h-7 w-2/3" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-24 w-full" />
              </>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            <SheetHeader className="text-left">
              <SheetTitle className="pr-6">{data.displayName}</SheetTitle>
              <SheetDescription>{KIND_LABELS[data.kind]} · {scheduleText(data)}</SheetDescription>
            </SheetHeader>

            <div>
              <p className="text-2xl font-semibold tabular-nums">{formatMoney(data.expectedAmount ?? data.amountLast, data.currency)}</p>
              <p className="text-sm text-muted-foreground">
                {data.nextExpectedDate && ['detected', 'confirmed'].includes(data.status)
                  ? `${out ? 'Следующее списание' : 'Следующее поступление'} — ${formatDate(data.nextExpectedDate)}`
                  : `Последний раз — ${formatDate(data.lastDate)}`}
                {data.periodicity !== 'monthly' && ` · ${formatMoney(data.monthlyEquivalent, data.currency)} в месяц`}
              </p>
              {out && data.kind === 'subscription' && (
                <p className="text-sm text-muted-foreground">В год — <span className="tabular-nums">{formatMoney(data.yearlyEquivalent, data.currency)}</span></p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {data.status === 'cancelled' && <Badge variant="secondary">Отменена {data.cancelledAt ? formatDate(data.cancelledAt.slice(0, 10)) : ''}</Badge>}
                {data.status === 'ended' && <Badge variant="secondary">Списания прекратились</Badge>}
                {data.priceChange && (
                  <Badge variant="outline" className="border-warning text-warning" data-testid="price-change">
                    Цена: {formatMoney(data.priceChange.from, data.currency)} → {formatMoney(data.priceChange.to, data.currency)} с {formatDate(data.priceChange.date)}
                  </Badge>
                )}
              </div>
            </div>

            {chart && chart.length > 1 && (
              <div className="h-36" aria-label="Суммы списаний">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
                    <Tooltip formatter={(_value, _name, item) => formatMoney(item.payload.raw, data.currency)} cursor={{ fill: 'var(--muted)' }} />
                    <Bar dataKey="amount" fill="var(--primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {out && <CancelGuide series={data} />}

            {out && ['detected', 'confirmed'].includes(data.status) && (
              <label className="flex items-center justify-between gap-3 text-sm">
                Напоминать до списания
                <Select value={String(data.remindDaysBefore)} onValueChange={(value) => void setRemind(Number(value))}>
                  <SelectTrigger className="w-36" data-testid="remind-days"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Не напоминать</SelectItem>
                    {[1, 2, 3, 5, 7].map((days) => <SelectItem key={days} value={String(days)}>За {days} {days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
            )}

            <div className="flex flex-wrap gap-2">
              {data.status === 'detected' && <Button onClick={() => void setStatus('confirmed')} disabled={status.isPending} data-testid="series-confirm">Да, регулярный платёж</Button>}
              {out && ['detected', 'confirmed'].includes(data.status) && (
                <Button variant="outline" onClick={() => void setStatus('cancelled')} disabled={status.isPending} data-testid="series-cancel">Отметить отменённой</Button>
              )}
              {['cancelled', 'ended'].includes(data.status) && (
                <Button variant="outline" onClick={() => void setStatus('confirmed')} disabled={status.isPending} data-testid="series-restore">Платёж снова действует</Button>
              )}
              {data.status !== 'ended' && (
                <Button variant="ghost" className="text-muted-foreground" onClick={() => void setStatus('ignored')} disabled={status.isPending} data-testid="series-ignore">
                  {out ? 'Это не подписка' : 'Это не регулярный доход'}
                </Button>
              )}
            </div>

            <section>
              <h3 className="mb-2 text-sm font-semibold">{out ? 'Списания' : 'Поступления'}</h3>
              <ul className="divide-y rounded-lg border text-sm" data-testid="series-transactions">
                {data.transactions.map((tx) => (
                  <li key={tx.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate">
                      {formatDate(tx.date)}
                      <span className="text-muted-foreground"> · {tx.merchant || tx.description}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{formatMoney(tx.amount.replace('-', ''), tx.currency)}</span>
                  </li>
                ))}
              </ul>
              {data.occurrences > data.transactions.length && (
                <p className="mt-1 text-xs text-muted-foreground">Показаны последние {data.transactions.length} из {data.occurrences}</p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
