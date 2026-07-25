import { queryOptions } from '@tanstack/react-query'

import type { Tables } from '#/lib/database.types'
import type { HijriSchedule } from '#/lib/schedule'
import { supabaseBrowser } from '#/lib/supabase/client'

/**
 * The shared Sunnah catalog — the public read-only reference tables seeded from the mobile app's
 * constants. The web app reads exactly the same rows the mobile `useCatalog` hook does, mapped to
 * these camelCase shapes.
 */

export type Category = { id: string; title: string }

export type Preset = {
  id: string
  categoryId: string
  name: string
  detail: string
  evidence: string
  defaultSchedule: number[]
  hijriSchedule?: HijriSchedule
  targetCount?: number
  targetUnit?: string
  essential: boolean
}

export type Routine = { id: string; name: string; detail: string; presetIds: string[] }

export type Catalog = {
  categories: Category[]
  presets: Preset[]
  routines: Routine[]
  hijriMonths: string[]
}

function mapPreset(row: Tables<'presets'>): Preset {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    detail: row.detail,
    evidence: row.evidence,
    defaultSchedule: row.default_schedule,
    hijriSchedule: (row.hijri_schedule as HijriSchedule | null) ?? undefined,
    targetCount: row.target_count ?? undefined,
    targetUnit: row.target_unit ?? undefined,
    essential: row.essential,
  }
}

type RoutineRow = Pick<Tables<'routines'>, 'id' | 'name' | 'detail'> & {
  routine_presets: Pick<Tables<'routine_presets'>, 'preset_id' | 'position'>[]
}

function mapRoutine(row: RoutineRow): Routine {
  const members = [...row.routine_presets].sort((a, b) => a.position - b.position)
  return { id: row.id, name: row.name, detail: row.detail, presetIds: members.map((m) => m.preset_id) }
}

async function fetchCatalog(): Promise<Catalog> {
  const [categories, presets, routines, months] = await Promise.all([
    supabaseBrowser.from('categories').select('id,title').order('sort_order'),
    supabaseBrowser.from('presets').select('*').order('sort_order'),
    supabaseBrowser
      .from('routines')
      .select('id,name,detail,routine_presets(preset_id,position)')
      .order('sort_order'),
    supabaseBrowser.from('hijri_months').select('month,name').order('month'),
  ])
  if (categories.error) throw categories.error
  if (presets.error) throw presets.error
  if (routines.error) throw routines.error
  if (months.error) throw months.error
  return {
    categories: categories.data.map((c) => ({ id: c.id, title: c.title })),
    presets: presets.data.map(mapPreset),
    routines: routines.data.map(mapRoutine),
    hijriMonths: months.data.map((m) => m.name),
  }
}

/** The catalog rarely changes — cache it for an hour. */
export const catalogQueryOptions = () =>
  queryOptions({ queryKey: ['catalog'], queryFn: fetchCatalog, staleTime: 1000 * 60 * 60 })

/** Resolve a routine's preset ids to its member presets, in sequence order. */
export function routinePresets(routine: Routine, presets: Preset[]): Preset[] {
  const byId = new Map(presets.map((p) => [p.id, p]))
  return routine.presetIds.map((id) => byId.get(id)).filter((p): p is Preset => p != null)
}

/** The field mapping for turning a preset into a new habit — mirrors mobile's `toCreate`. */
export function presetToHabit(preset: Preset) {
  return {
    name: preset.name,
    schedule_days: preset.hijriSchedule ? [] : preset.defaultSchedule,
    hijri_schedule: preset.hijriSchedule ?? null,
    target_count: preset.targetCount ?? null,
    target_unit: preset.targetUnit ?? null,
  }
}
