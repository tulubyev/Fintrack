import { Banknote, Landmark, LineChart, PiggyBank, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Account } from './api';

// Узнаваемые цвета банков; логотипы появятся вместе со справочником (logoUrl в /institutions)
const BANK_STYLE: Record<string, { letter: string; className: string }> = {
  sber: { letter: 'С', className: 'bg-[#21a038] text-white' },
  tbank: { letter: 'Т', className: 'bg-[#ffdd2d] text-black' },
  alfa: { letter: 'А', className: 'bg-[#ef3124] text-white' },
  vtb: { letter: 'В', className: 'bg-[#0a2896] text-white' },
  ozon: { letter: 'О', className: 'bg-[#005bff] text-white' },
  yandex: { letter: 'Я', className: 'bg-[#fc3f1d] text-white' },
  gazprom: { letter: 'Г', className: 'bg-[#00468c] text-white' },
  raif: { letter: 'Р', className: 'bg-[#fee600] text-black' },
};

export function AccountIcon({ account, className }: { account: Pick<Account, 'kind' | 'institutionCode'>; className?: string }) {
  const bank = account.institutionCode ? BANK_STYLE[account.institutionCode] : undefined;
  const base = cn('flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold', className);
  if (bank) return <span className={cn(base, bank.className)} aria-hidden>{bank.letter}</span>;

  const Icon = account.kind === 'cash' ? Banknote
    : account.kind === 'savings' || account.kind === 'deposit' ? PiggyBank
    : account.kind === 'brokerage' || account.kind === 'iis' ? LineChart
    : account.kind === 'loan' ? Landmark
    : Wallet;
  return <span className={cn(base, 'bg-muted text-muted-foreground')} aria-hidden><Icon className="size-5" /></span>;
}
