import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Plus, Unlink } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'

import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Checkbox } from '#/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Skeleton } from '#/components/ui/skeleton'
import {
  createStack,
  deleteStack,
  habitsQueryOptions,
  stacksQueryOptions,
  type Habit,
} from '#/lib/habits'

export const Route = createFileRoute('/_authed/routines')({ component: RoutinesPage })

function RoutinesPage() {
  const { data: stacks, isPending: sp } = useQuery(stacksQueryOptions())
  const { data: habits, isPending: hp } = useQuery(habitsQueryOptions())
  const qc = useQueryClient()
  const [creating, setCreating] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['stacks'] })
    qc.invalidateQueries({ queryKey: ['habits'] })
  }
  const del = useMutation({ mutationFn: deleteStack, onSuccess: invalidate })

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
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Routines</h1>
          <p className="text-sm text-muted-foreground">Group habits that belong together.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 size-4" /> New routine
        </Button>
      </div>

      {sp || hp ? (
        <div className="grid gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : stacks && stacks.length > 0 ? (
        <div className="grid gap-3">
          {stacks.map((s) => {
            const members = membersByStack.get(s.id) ?? []
            return (
              <Card key={s.id} className="gap-3 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{s.name}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => del.mutate(s.id)}
                    title="Ungroup (keeps the habits)"
                  >
                    <Unlink className="mr-1 size-4" /> Ungroup
                  </Button>
                </div>
                <ol className="grid gap-1">
                  {members.map((m, i) => (
                    <li key={m.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="w-4 text-center tabular-nums">{i + 1}</span>
                      <span className="truncate text-foreground">{m.name}</span>
                    </li>
                  ))}
                  {members.length === 0 && <li className="text-sm text-muted-foreground">No habits in this routine.</li>}
                </ol>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card className="p-10 text-center text-muted-foreground">
          No routines yet. Create one below, or add a ready-made one from{' '}
          <span className="font-medium text-foreground">Discover</span>.
        </Card>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New routine</DialogTitle>
          </DialogHeader>
          {creating && (
            <NewRoutineForm
              ungrouped={ungrouped}
              onSaved={() => {
                setCreating(false)
                invalidate()
              }}
            />
          )}
        </DialogContent>
      </Dialog>
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
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="rname">Name</Label>
        <Input id="rname" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="e.g. Morning" />
      </div>
      <div className="grid gap-2">
        <Label>Habits</Label>
        {ungrouped.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No ungrouped habits available. Add some on the Habits page first.
          </p>
        ) : (
          <div className="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-2">
            {ungrouped.map((h) => (
              <label key={h.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={selected.has(h.id)} onCheckedChange={() => toggle(h.id)} />
                <span className="text-sm">{h.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={busy || ungrouped.length === 0}>
          {busy ? 'Saving…' : 'Create routine'}
        </Button>
      </DialogFooter>
    </form>
  )
}
