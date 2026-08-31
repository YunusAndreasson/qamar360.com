import type { ReactNode } from 'react'

import { QamarMark } from '#/components/qamar-logo'
import { Card } from '#/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
// `Field` is also the name this kit exports, so the primitive is aliased.
import { Field as UIField, FieldLabel } from '#/components/ui/field'
import { Item } from '#/components/ui/item'
import { Separator } from '#/components/ui/separator'
import { Skeleton } from '#/components/ui/skeleton'
import { cn } from '#/lib/utils'

/** Page header: title + a quiet subtitle line, with an action slot. */
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
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {readout != null && <p className="mt-1.5 text-sm text-muted-foreground">{readout}</p>}
      </div>
      {action}
    </header>
  )
}

/** The base surface for every card. Thin wrapper so call sites stay put. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <Card className={cn('gap-0 py-0', className)}>{children}</Card>
}

/** One row in a list. */
export function RowCard({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Item variant="outline" size="sm" className={cn('gap-3', className)}>
      {children}
    </Item>
  )
}

/** Vertical list of rows — the one list rhythm used everywhere. */
export function RowList({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('grid gap-2', className)}>{children}</div>
}

/** Loading placeholder mirroring a RowList of `rows` rows of `height` px. */
export function ListSkeleton({ rows = 4, height = 68 }: { rows?: number; height?: number }) {
  return (
    <RowList>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="w-full rounded-lg" style={{ height }} />
      ))}
    </RowList>
  )
}

/** Section header: small title + count readout + rule to the edge. */
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
    <section className="grid gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {count != null && (
          <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
        )}
        <Separator className="flex-1" />
      </div>
      {children}
    </section>
  )
}

/** Centered empty state, anchored by the brand mark. */
export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Empty className="rounded-xl border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <QamarMark size={24} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {children != null && <EmptyDescription>{children}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
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
    <UIField>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
    </UIField>
  )
}

/** Inline form error line. Renders nothing when there is no message. */
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return <p className="text-sm text-destructive">{message}</p>
}

/** Inline form success/notice line. */
export function FormNotice({ message }: { message?: string | null }) {
  if (!message) return null
  return <p className="text-sm text-success">{message}</p>
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
