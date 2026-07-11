import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Check, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { EmptyState, ListSkeleton, PageHeader, Panel, RowCard, Section } from '#/components/console'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  catalogQueryOptions,
  presetToHabit,
  routinePresets,
  type Preset,
  type Routine,
} from '#/lib/catalog'
import {
  createHabit,
  createHabits,
  createStack,
  habitsQueryOptions,
  invalidateHabitData,
  stacksQueryOptions,
} from '#/lib/habits'
import { normalizeName } from '#/lib/names'
import { scheduleSummary } from '#/lib/schedule'
import { countLabel } from '#/lib/utils'

export const Route = createFileRoute('/_authed/discover')({ component: DiscoverPage })

function DiscoverPage() {
  const { data: catalog, isPending } = useQuery(catalogQueryOptions())
  const { data: habits } = useQuery(habitsQueryOptions())
  const { data: stacks } = useQuery(stacksQueryOptions())
  const qc = useQueryClient()
  const [query, setQuery] = useState('')

  const existing = useMemo(() => new Set((habits ?? []).map((h) => normalizeName(h.name))), [habits])
  const existingStacks = useMemo(() => new Set((stacks ?? []).map((s) => normalizeName(s.name))), [stacks])

  const invalidate = () => invalidateHabitData(qc)

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
      <PageHeader title="Discover" readout="A curated library of Sunnah habits and routines." />

      <div className="relative mb-7">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search habits and routines…"
          className="h-11 pl-9"
        />
      </div>

      {isPending ? (
        <ListSkeleton rows={6} height={72} />
      ) : (
        <div className="grid gap-8">
          {!q && essentialsRemaining.length > 0 && (
            <Panel className="rise-in p-5">
              <div className="text-base font-medium text-foreground">
                New here? Start with the essentials
              </div>
              <p className="mt-1.5 text-sm text-muted-foreground">
                The moments already in your day: prayer times, morning and evening adhkār, and a daily page of Qurʾān.
              </p>
              <Button
                className="mt-4"
                disabled={addStarter.isPending}
                onClick={() => addStarter.mutate(essentialsRemaining)}
              >
                Add starter set ({essentialsRemaining.length})
              </Button>
            </Panel>
          )}

          {visibleRoutines.length > 0 && (
            <Section title="Routines" count={visibleRoutines.length}>
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
            </Section>
          )}

          {sections.map(({ category, presets: items }) => (
            <Section key={category.id} title={category.title} count={items.length}>
              {items.map((p) => (
                <PresetRow
                  key={p.id}
                  preset={p}
                  added={existing.has(normalizeName(p.name))}
                  busy={addPreset.isPending}
                  onAdd={() => addPreset.mutate(p)}
                />
              ))}
            </Section>
          ))}

          {q && visibleRoutines.length === 0 && sections.length === 0 && (
            <EmptyState title="No matches">
              Nothing in the catalog matches “{query.trim()}”.
            </EmptyState>
          )}
        </div>
      )}
    </div>
  )
}

function AddButton({ added, busy, onAdd }: { added: boolean; busy: boolean; onAdd: () => void }) {
  if (added) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-ok">
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
    <RowCard className="items-start justify-between">
      <div className="min-w-0">
        <div className="font-medium text-foreground">{preset.name}</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {scheduleSummary(preset.defaultSchedule, preset.hijriSchedule)}
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{preset.detail}</p>
      </div>
      <AddButton added={added} busy={busy} onAdd={onAdd} />
    </RowCard>
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
    <RowCard className="items-start justify-between">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2.5">
          <span className="font-medium text-foreground">{routine.name}</span>
          <span className="text-sm text-muted-foreground">{countLabel(memberCount, 'habit')}</span>
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{routine.detail}</p>
      </div>
      <AddButton added={added} busy={busy} onAdd={onAdd} />
    </RowCard>
  )
}
