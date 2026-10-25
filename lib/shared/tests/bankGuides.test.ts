import { describe, expect, it } from 'vitest';
import { BANK_GUIDES, BANK_IMPORT_STATUS, bankGuide } from '../src/bankGuides';

describe('инструкции банков', () => {
  it('коды уникальны и годятся для адреса /banks/<код>', () => {
    const codes = BANK_GUIDES.map((guide) => guide.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[a-z0-9-]+$/);
  });

  it('статус согласован с форматами: «скоро» — нечего загрузить, иначе есть хоть один формат', () => {
    for (const guide of BANK_GUIDES) {
      expect(BANK_IMPORT_STATUS[guide.status]).toBeTruthy();
      expect(guide.formats.length === 0).toBe(guide.status === 'soon');
      expect(guide.steps.length).toBeGreaterThan(0);
    }
  });

  it('bankGuide: известный код, неизвестный и пустой', () => {
    expect(bankGuide('tbank')?.name).toBe('Т-Банк');
    expect(bankGuide('nope')).toBeUndefined();
    expect(bankGuide(null)).toBeUndefined();
  });
});
