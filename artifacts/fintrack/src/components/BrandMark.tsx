/**
 * Знак «Кладка» (фирменный стиль v0.1, E1.8-T8): верхний сплошной слой — сервис, под ним «кирпичи» — счета в разных банках.
 * Цвета — токены --logo-top и --logo-base, сами меняются в тёмной теме. Такой же знак — в шапке сайта и в иконке приложения.
 */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <rect x="6" y="8" width="36" height="8" rx="3" fill="var(--logo-top)" />
      <g fill="var(--logo-base)">
        <rect x="6" y="20" width="20" height="8" rx="3" />
        <rect x="30" y="20" width="12" height="8" rx="3" />
        <rect x="6" y="32" width="10" height="8" rx="3" />
        <rect x="20" y="32" width="22" height="8" rx="3" />
      </g>
    </svg>
  );
}
