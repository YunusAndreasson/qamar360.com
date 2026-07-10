import type { ReactNode } from 'react'

import { QamarMark } from '#/components/qamar-logo'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Label } from '#/components/ui/label'
import { Skeleton } from '#/components/ui/skeleton'
import { cn } from '#/lib/utils'

/** Page header: display title + a quiet subtitle line, with an action slot. */
export function PageHeader({
  title,
  readout,
  action,
}: {
  title: string
  readout?: ReactNode
  action?: ReactNode
}) {
  return (
    <header className="rise-in mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="display-title text-[2rem] leading-none text-foreground sm:text-[2.4rem]">
          {title}
        </h1>
        {readout != null && <p className="mt-3 text-sm text-muted-foreground">{readout}</p>}
      </div>
      {action}
    </header>
  )
}

/** Flat instrument panel. `framed` adds the HUD corner brackets. */
export function Panel({
  framed,
  className,
  children,
}: {
  framed?: boolean
  className?: string
  children: ReactNode
}) {
  return <div className={cn('panel', framed && 'panel--framed', className)}>{children}</div>
}

/** One row in a list: quiet hairline card with the signal-edge hover. */
export function RowCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rowcard flex gap-3 py-3.5 pl-4 pr-4', className)}>{children}</div>
}

/** Vertical list of RowCards / panels — the one list rhythm used everywhere. */
export function RowList({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('grid gap-2.5', className)}>{children}</div>
}

/** Loading placeholder mirroring a RowList of `rows` rows of `height` px. */
export function ListSkeleton({ rows = 4, height = 68 }: { rows?: number; height?: number }) {
  return (
    <RowList>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="w-full rounded-md" style={{ height }} />
      ))}
    </RowList>
  )
}

/** Section header: small title + count readout + hairline rule to the edge. */
export function Section({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="grid gap-2.5">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {count != null && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
        <span className="h-px flex-1 bg-border" />
      </div>
      {children}
    </section>
  )
}

/** Centered empty-state inside a framed panel, anchored by the orbital mark. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Panel framed className="rise-in flex flex-col items-center px-8 py-14 text-center">
      <QamarMark size={44} className="text-muted-foreground opacity-60" />
      <p className="display-title mt-5 text-lg text-foreground">{title}</p>
      {children != null && (
        <p className="mt-2 max-w-[46ch] text-sm text-muted-foreground">{children}</p>
      )}
    </Panel>
  )
}

/** Labelled form field: the one Label-over-control stack used in every form. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

/** Inline form error line. Renders nothing when there is no message. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return <p className="text-sm text-destructive">{message}</p>
}

/** Inline form success/notice line, in the status-OK color. */
export function FormNotice({ message }: { message?: string | null }) {
  if (!message) return null
  return <p className="text-sm text-ok">{message}</p>
}

/** Modal dialog around a form. Children mount only while open, so form state resets. */
export function FormDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {open && children}
      </DialogContent>
    </Dialog>
  )
}
