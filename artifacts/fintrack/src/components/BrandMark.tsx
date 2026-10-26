/**
 * Знак «Грань» (фирменный стиль, docs/brand/03-logo.md): алмаз — корона сверху и три грани, потоки со всех счетов,
 * которые сходятся в одну точку. Цвета — токены --logo-top, --logo-mid и --logo-base, сами меняются по теме.
 * Такой же знак — в шапке сайта и в иконке приложения.
 */
export function BrandMark({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <path d="M14 8h20l9 11H5z" fill="var(--logo-top)" />
      <path d="M5 21h11.5L24 40z" fill="var(--logo-base)" />
      <path d="M18.5 21h11L24 40z" fill="var(--logo-mid)" />
      <path d="M31.5 21H43L24 40z" fill="var(--logo-base)" />
    </svg>
  );
}
