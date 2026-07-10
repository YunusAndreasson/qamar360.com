import { cn } from '#/lib/utils'

/**
 * The Qamar mark — a pure geometric "Q": a perfect circle with the letter's
 * tail-tick crossing it at the lower right. Same geometry as the mobile app
 * icon (assets/logo/qamar-mark.svg). Inherits `currentColor`.
 */
export function QamarMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      fill="none"
      className={cn('block', className)}
      aria-hidden
    >
      <circle cx="512" cy="512" r="312" fill="none" stroke="currentColor" strokeWidth="40" />
      <line
        x1="703"
        y1="703"
        x2="789"
        y2="789"
        stroke="currentColor"
        strokeWidth="40"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** The brand name with its dimmed "360" — always spelled this way. */
export function QamarBrandName({ className }: { className?: string }) {
  return (
    <span className={className}>
      Qamar<span className="text-muted-foreground">360</span>
    </span>
  )
}

/** Mark + wordmark lockup used in the header and on the sign-in screen. */
export function QamarWordmark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <QamarMark size={size} className="text-signal" />
      <QamarBrandName className="font-display text-[0.95rem] font-semibold tracking-[0.02em] text-foreground" />
    </span>
  )
}
