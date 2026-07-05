import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Check, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import {
  catalogQueryOptions,
  presetToHabit,
  routinePresets,
  type Preset,
  type Routine,
} from '#/lib/catalog'
import { createHabit, createHabits, createStack, habitsQueryOptions, stacksQueryOptions } from '#/lib/habits'
import { normalizeName } from '#/lib/names'
import { scheduleSummary } from '#/lib/schedule'

export const Route = createFileRoute('/_authed/discover')({ component: DiscoverPage })

function DiscoverPage() {
  const { data: catalog, isPending } = useQuery(catalogQueryOptions())
  const { data: habits } = useQuery(habitsQueryOptions())
  const { data: stacks } = useQuery(stacksQueryOptions())
  const qc = useQueryClient()
  const [query, setQuery] = useState('')

  const existing = useMemo(() => new Set((habits ?? []).map((h) => normalizeName(h.name))), [habits])
  const existingStacks = useMemo(() => new Set((stacks ?? []).map((s) => normalizeName(s.name))), [stacks])

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['habits'] })
    qc.invalidateQueries({ queryKey: ['stacks'] })
  }

  const addPreset = useMutation({
    mutationFn: (p: Preset) => createHabit(presetToHabit(p)),
    onSuccess: invalidate,
  })
  const addStarter = useMutation({
    mutationFn: (presets: Preset[]) => createHabits(presets.map(presetToHabit)),
    onSuccess: invalidate,
  })
  const addRoutine = useMutation({
    mutationFn: async (routine: Routine) => {
      const members = routinePresets(routine, catalog?.presets ?? [])
      const byName = new Map((habits ?? []).map((h) => [normalizeName(h.name), h.id]))
      const missing = members.filter((p) => !byName.has(normalizeName(p.name)))
      const created = await createHabits(missing.map(presetToHabit))
      for (const h of created) byName.set(normalizeName(h.name), h.id)
      const orderedIds = members
        .map((p) => byName.get(normalizeName(p.name)))
        .filter((id): id is string => id != null)
      if (orderedIds.length > 0) await createStack(routine.name, orderedIds)
    },
    onSuccess: invalidate,
  })

  const q = query.trim().toLowerCase()
  const presets = catalog?.presets ?? []
  const routines = catalog?.routines ?? []
  const match = (t: string) => t.toLowerCase().includes(q)

  const essentialsRemaining = presets.filter((p) => p.essential && !existing.has(normalizeName(p.name)))
  const visibleRoutines = routines.filter((r) => !q || match(r.name) || match(r.detail))
  const sections = (catalog?.categories ?? [])
    .map((c) => ({ category: c, presets: presets.filter((p) => p.categoryId === c.id && (!q || match(p.name) || match(p.detail))) }))
    .filter((s) => s.presets.length > 0)

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Discover</h1>
        <p className="text-sm text-muted-foreground">A curated library of Sunnah habits and routines.</p>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search habits and routines…"
        className="mb-5"
      />

      {isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-6">
          {!q && essentialsRemaining.length > 0 && (
            <Card className="gap-2 bg-accent/40 p-5">
              <div className="font-medium">New here? Start with the essentials</div>
              <p className="text-sm text-muted-foreground">
                The moments already in your day: prayer times, morning and evening adhkār, and a daily page of Qurʾān.
              </p>
              <div>
                <Button
                  className="mt-1"
                  disabled={addStarter.isPending}
                  onClick={() => addStarter.mutate(essentialsRemaining)}
                >
                  Add starter set ({essentialsRemaining.length})
                </Button>
              </div>
            </Card>
          )}

          {visibleRoutines.length > 0 && (
            <section className="grid gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Routines</h2>
              {visibleRoutines.map((r) => (
                <RoutineRow
                  key={r.id}
                  routine={r}
                  memberCount={routinePresets(r, presets).length}
                  added={existingStacks.has(normalizeName(r.name))}
                  busy={addRoutine.isPending}
                  onAdd={() => addRoutine.mutate(r)}
                />
              ))}
            </section>
          )}

          {sections.map(({ category, presets: items }) => (
            <section key={category.id} className="grid gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{category.title}</h2>
              {items.map((p) => (
                <PresetRow
                  key={p.id}
                  preset={p}
                  added={existing.has(normalizeName(p.name))}
                  busy={addPreset.isPending}
                  onAdd={() => addPreset.mutate(p)}
                />
              ))}
            </section>
          ))}

          {q && visibleRoutines.length === 0 && sections.length === 0 && (
            <Card className="p-10 text-center text-muted-foreground">No matches for “{query.trim()}”.</Card>
          )}
        </div>
      )}
    </div>
  )
}

function AddButton({ added, busy, onAdd }: { added: boolean; busy: boolean; onAdd: () => void }) {
  if (added) {
    return (
      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <Check className="size-4" /> Added
      </span>
    )
  }
  return (
    <Button variant="outline" size="sm" className="shrink-0" disabled={busy} onClick={onAdd}>
      <Plus className="mr-1 size-4" /> Add
    </Button>
  )
}

function PresetRow({ preset, added, busy, onAdd }: { preset: Preset; added: boolean; busy: boolean; onAdd: () => void }) {
  return (
    <Card className="flex flex-row items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="font-medium">{preset.name}</div>
        <div className="text-sm text-muted-foreground">{scheduleSummary(preset.defaultSchedule, preset.hijriSchedule)}</div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{preset.detail}</p>
      </div>
      <AddButton added={added} busy={busy} onAdd={onAdd} />
    </Card>
  )
}

function RoutineRow({
  routine,
  memberCount,
  added,
  busy,
  onAdd,
}: {
  routine: Routine
  memberCount: number
  added: boolean
  busy: boolean
  onAdd: () => void
}) {
  return (
    <Card className="flex flex-row items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="font-medium">
          {routine.name} <span className="text-sm font-normal text-muted-foreground">· {memberCount} habits</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{routine.detail}</p>
      </div>
      <AddButton added={added} busy={busy} onAdd={onAdd} />
    </Card>
  )
}
