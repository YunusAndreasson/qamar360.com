import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import {
  EmptyState,
  Field,
  FormDialog,
  FormError,
  ListSkeleton,
  PageHeader,
  RowCard,
  RowList,
} from '#/components/page'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { DialogFooter } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '#/components/ui/toggle-group'
import {
  createHabit,
  deleteHabit,
  habitsQueryOptions,
  invalidateHabitData,
  updateHabit,
  type Habit,
} from '#/lib/habits'
import { DAILY_SCHEDULE, scheduleSummary, SHORT_WEEKDAYS, WEEKDAY_LABELS } from '#/lib/schedule'
import { countLabel } from '#/lib/utils'

export const Route = createFileRoute('/_authed/habits')({ component: HabitsPage })

function HabitsPage() {
  const { data: habits, isPending } = useQuery(habitsQueryOptions())
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Habit | null>(null)
  const [creating, setCreating] = useState(false)

  const del = useMutation({
    mutationFn: deleteHabit,
    onSuccess: () => invalidateHabitData(qc),
  })

  const close = () => {
    setCreating(false)
    setEditing(null)
  }

  return (
    <div>
      <PageHeader
        title="Habits"
        readout={isPending ? undefined : countLabel(habits?.length ?? 0, 'habit')}
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1 size-4" /> New habit
          </Button>
        }
      />

      {isPending ? (
        <ListSkeleton rows={4} height={62} />
      ) : habits && habits.length > 0 ? (
        <RowList>
          {habits.map((h) => (
            <RowCard key={h.id} className="items-center gap-4 py-3 pr-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="truncate font-medium text-foreground">{h.name}</span>
                {h.stack_id && (
                  <Badge variant="secondary">
                    routine
                  </Badge>
                )}
              </div>
              <div className="ml-auto flex items-center gap-5">
                {(() => {
                  // "Every day" is the default for most habits — showing it on every row is noise.
                  // Surface the schedule only when it differs, so non-daily habits actually stand out.
                  const sched = scheduleSummary(h.schedule_days, h.hijri_schedule)
                  const parts = [
                    sched === 'Every day' ? '' : sched,
                    h.target_count ? `${h.target_count} ${h.target_unit ?? ''}`.trimEnd() : '',
                  ].filter(Boolean)
                  return parts.length ? (
                    <span className="hidden text-sm tabular-nums text-muted-foreground sm:block">
                      {parts.join(' · ')}
                    </span>
                  ) : null
                })()}
                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Edit"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setEditing(h)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => del.mutate(h.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </RowCard>
          ))}
        </RowList>
      ) : (
        <EmptyState title="No habits yet">
          Create one, or add a ready-made habit from <Link to="/discover">Discover</Link>.
        </EmptyState>
      )}

      <FormDialog
        open={creating || editing != null}
        onClose={close}
        title={editing ? 'Edit habit' : 'New habit'}
      >
        <HabitForm
          key={editing?.id ?? 'new'}
          habit={editing}
          onSaved={() => {
            close()
            invalidateHabitData(qc)
          }}
        />
      </FormDialog>
    </div>
  )
}

function HabitForm({ habit, onSaved }: { habit: Habit | null; onSaved: () => void }) {
  const isHijri = !!habit?.hijri_schedule
  const [name, setName] = useState(habit?.name ?? '')
  const [days, setDays] = useState<number[]>(habit?.schedule_days ?? DAILY_SCHEDULE)
  const [targetCount, setTargetCount] = useState(habit?.target_count?.toString() ?? '')
  const [targetUnit, setTargetUnit] = useState(habit?.target_unit ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required')
    setBusy(true)
    setError(null)
    try {
      const count = targetCount.trim() ? Number(targetCount) : null
      const unit = count && targetUnit.trim() ? targetUnit.trim() : null
      if (habit) {
        await updateHabit(habit.id, {
          name: name.trim(),
          ...(isHijri ? {} : { schedule_days: days }),
          target_count: count,
          target_unit: unit,
        })
      } else {
        await createHabit({
          name: name.trim(),
          schedule_days: days,
          hijri_schedule: null,
          target_count: count,
          target_unit: unit,
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Field label="Name" htmlFor="name">
        <Input id="name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </Field>

      {isHijri ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Scheduled on the Hijri calendar: {scheduleSummary(habit!.schedule_days, habit!.hijri_schedule)} (edit in the
          mobile app).
        </p>
      ) : (
        <Field label="Days">
          {/* The labels repeat (S M T W T F S), so the value carried is the day INDEX. */}
          <ToggleGroup
            type="multiple"
            variant="outline"
            value={days.map(String)}
            onValueChange={(v: string[]) => setDays(v.map(Number).sort((a, b) => a - b))}
          >
            {WEEKDAY_LABELS.map((lbl, d) => (
              <ToggleGroupItem
                key={d}
                value={String(d)}
                aria-label={SHORT_WEEKDAYS[d]}
                // The stock on-state is `bg-accent`, one 0.06-lightness step off this card — far
                // too quiet for a control whose only job is showing which days are picked.
                className="size-9 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              >
                {lbl}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Daily goal (optional)" htmlFor="count">
          <Input
            id="count"
            type="number"
            min={1}
            value={targetCount}
            onChange={(e) => setTargetCount(e.target.value)}
            placeholder="e.g. 8"
          />
        </Field>
        <Field label="Unit" htmlFor="unit">
          <Input id="unit" value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} placeholder="cups" />
        </Field>
      </div>

      <FormError message={error} />

      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}
