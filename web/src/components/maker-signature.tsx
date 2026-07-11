import { cn } from '#/lib/utils'

/**
 * A quiet "follow the maker" signature — a byline that links to the hub, plus the four personal
 * social profiles. Plain text links (no badges/logos) so it stays a signature, not a billboard.
 * `rel="me"` ties the outbound links back to the same identity for verification.
 *
 * Reused by the authed footer (`_authed.tsx`) and the public sign-in screen (`login.tsx`).
 */
const HUB = 'https://andreassonphoto.com/about'

const SOCIALS = [
  { label: 'GitHub', href: 'https://github.com/YunusAndreasson' },
  { label: 'X', href: 'https://x.com/YunusAndreasson' },
  { label: 'Instagram', href: 'https://www.instagram.com/andreasson.photo/' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/yunusandreasson/' },
] as const

export function MakerSignature({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground',
        className,
      )}
    >
      <a
        href={HUB}
        target="_blank"
        rel="me noopener noreferrer"
        className="transition-colors hover:text-signal"
      >
        Made by Yunus Andreasson
      </a>
      <span aria-hidden className="opacity-40">
        ·
      </span>
      {SOCIALS.map((s) => (
        <a
          key={s.label}
          href={s.href}
          target="_blank"
          rel="me noopener noreferrer"
          className="transition-colors hover:text-signal"
        >
          {s.label}
        </a>
      ))}
    </div>
  )
}
