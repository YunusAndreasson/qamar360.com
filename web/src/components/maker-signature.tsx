import { cn } from '#/lib/utils'

/**
 * A quiet maker signature — a single byline that links to the maker's projects
 * page (the one place that lists his other work, so this stays a signature, not
 * a billboard). `rel="me"` ties the outbound link back to the same identity.
 *
 * Reused by the authed footer (`_authed.tsx`) and the public sign-in screen (`login.tsx`).
 */
const PROJECTS = 'https://andreassonphoto.com/projects'

export function MakerSignature({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted-foreground',
        className,
      )}
    >
      <a
        href={PROJECTS}
        target="_blank"
        rel="me noopener noreferrer"
        className="transition-colors hover:text-foreground"
      >
        Made by Edenmind
      </a>
    </div>
  )
}
