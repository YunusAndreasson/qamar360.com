import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, Unlink } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'

import {
  EmptyState,
  Field,
  FormDialog,
  FormError,
  ListSkeleton,
  PageHeader,
  Panel,
  RowList,
} from '#/components/page'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { ScrollArea } from '#/components/ui/scroll-area'
import { DialogFooter } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import {
  createStack,
  deleteStack,
  habitsQueryOptions,
  invalidateHabitData,
  stacksQueryOptions,
  type Habit,
} from '#/lib/habits'
import { countLabel } from '#/lib/utils'

export const Route = createFileRoute('/_authed/routines')({ component: RoutinesPage })

function RoutinesPage() {
  const { data: stacks, isPending: sp } = useQuery(stacksQueryOptions())
  const { data: habits, isPending: hp } = useQuery(habitsQueryOptions())
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)

  const isPending = sp || hp
  const del = useMutation({ mutationFn: deleteStack, onSuccess: () => invalidateHabitData(qc) })

  const membersByStack = useMemo(() => {
    const map = new Map<string, Habit[]>()
    for (const h of habits ?? []) {
      if (!h.stack_id) continue
      const arr = map.get(h.stack_id) ?? []
      arr.push(h)
      map.set(h.stack_id, arr)
    }
    return map
  }, [habits])

  const ungrouped = (habits ?? []).filter((h) => !h.stack_id)

  return (
    <div>
      <PageHeader
        title="Routines"
        readout={isPending ? undefined : countLabel(stacks?.length ?? 0, 'routine')}
        action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1 size-4" /> New routine
          </Button>
        }
      />

      {isPending ? (
        <ListSkeleton rows={3} height={112} />
      ) : stacks && stacks.length > 0 ? (
        <RowList>
          {stacks.map((s) => {
            const members = membersByStack.get(s.id) ?? []
            return (
              <Panel key={s.id} className="p-4">
                <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {countLabel(members.length, 'habit')}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => del.mutate(s.id)}
                    title="Ungroup (keeps the habits)"
                    className="text-muted-foreground"
                  >
                    <Unlink className="mr-1 size-4" /> Ungroup
                  </Button>
                </div>
                <ol className="mt-3 grid gap-1.5">
                  {members.map((m, i) => (
                    <li key={m.id} className="flex items-center gap-3 text-sm">
                      <span className="w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="truncate text-foreground">{m.name}</span>
                    </li>
                  ))}
                  {members.length === 0 && (
                    <li className="text-sm text-muted-foreground">No habits in this routine.</li>
                  )}
                </ol>
              </Panel>
            )
          })}
        </RowList>
      ) : (
        <EmptyState title="No routines yet">
          Create one, or add a ready-made routine from <Link to="/discover">Discover</Link>.
        </EmptyState>
      )}

      <FormDialog open={creating} onClose={() => setCreating(false)} title="New routine">
        <NewRoutineForm
          ungrouped={ungrouped}
          onSaved={() => {
            setCreating(false)
            invalidateHabitData(qc)
          }}
        />
      </FormDialog>
    </div>
  )
}

function NewRoutineForm({ ungrouped, onSaved }: { ungrouped: Habit[]; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!name.trim()) return setError('Name is required')
    if (selected.size === 0) return setError('Pick at least one habit')
    setBusy(true)
    setError(null)
    try {
      await createStack(name.trim(), [...selected])
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <Field label="Name" htmlFor="rname">
        <Input id="rname" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning" />
      </Field>
      <Field label="Habits">
        {ungrouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No ungrouped habits available. Add some on the Habits page first.
          </p>
        ) : (
          <ScrollArea className="h-64 rounded-md border">
            <div className="grid gap-1 p-2">
              {ungrouped.map((h) => (
                <label
                  key={h.id}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
                >
                  <Checkbox checked={selected.has(h.id)} onCheckedChange={() => toggle(h.id)} />
                  <span className="text-sm">{h.name}</span>
                </label>
              ))}
            </div>
          </ScrollArea>
        )}
      </Field>
      <FormError message={error} />
      <DialogFooter>
        <Button type="submit" disabled={busy || ungrouped.length === 0}>
          {busy ? 'Saving…' : 'Create routine'}
        </Button>
      </DialogFooter>
    </form>
  )
}
