import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Skeleton } from '#/components/ui/skeleton'
import {
  createHabit,
  deleteHabit,
  habitsQueryOptions,
  updateHabit,
  type Habit,
} from '#/lib/habits'
import { DAILY_SCHEDULE, scheduleSummary, WEEKDAY_LABELS } from '#/lib/schedule'
import { cn } from '#/lib/utils'

export const Route = createFileRoute('/_authed/habits')({ component: HabitsPage })

function HabitsPage() {
  const { data: habits, isPending } = useQuery(habitsQueryOptions())
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Habit | null>(null)
  const [creating, setCreating] = useState(false)

  const del = useMutation({
    mutationFn: deleteHabit,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['habits'] }),
  })

  const close = () => {
    setCreating(false)
    setEditing(null)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Habits</h1>
          <p className="text-sm text-muted-foreground">{habits?.length ?? 0} habits</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 size-4" /> New habit
        </Button>
      </div>

      {isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : habits && habits.length > 0 ? (
        <div className="grid gap-2">
          {habits.map((h) => (
            <Card key={h.id} className="flex flex-row items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{h.name}</span>
                  {h.stack_id && <Badge variant="secondary">routine</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {scheduleSummary(h.schedule_days, h.hijri_schedule)}
                  {h.target_count ? ` · goal ${h.target_count} ${h.target_unit ?? ''}`.trimEnd() : ''}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(h)}>
                  <Pencil className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => del.mutate(h.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center text-muted-foreground">
          No habits yet. Create one, or add from <span className="font-medium text-foreground">Discover</span>.
        </Card>
      )}

      <Dialog open={creating || editing != null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit habit' : 'New habit'}</DialogTitle>
          </DialogHeader>
          {(creating || editing) && (
            <HabitForm
              key={editing?.id ?? 'new'}
              habit={editing}
              onSaved={() => {
                close()
                qc.invalidateQueries({ queryKey: ['habits'] })
              }}
            />
          )}
        </DialogContent>
      </Dialog>
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

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)))

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
          reminder_time: null,
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
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      </div>

      {isHijri ? (
        <p className="text-sm text-muted-foreground">
          Scheduled on the Hijri calendar: {scheduleSummary(habit!.schedule_days, habit!.hijri_schedule)} (edit in the
          mobile app).
        </p>
      ) : (
        <div className="grid gap-2">
          <Label>Days</Label>
          <div className="flex gap-1">
            {WEEKDAY_LABELS.map((lbl, d) => (
              <button
                type="button"
                key={d}
                onClick={() => toggleDay(d)}
                aria-pressed={days.includes(d)}
                className={cn(
                  'size-9 rounded-md border text-sm transition-colors',
                  days.includes(d)
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background hover:bg-muted',
                )}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor="count">Daily goal (optional)</Label>
          <Input
            id="count"
            type="number"
            min={1}
            value={targetCount}
            onChange={(e) => setTargetCount(e.target.value)}
            placeholder="e.g. 8"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" value={targetUnit} onChange={(e) => setTargetUnit(e.target.value)} placeholder="cups" />
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}
