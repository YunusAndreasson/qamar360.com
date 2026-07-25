import { queryOptions, type QueryClient } from '@tanstack/react-query'

import type { Tables } from '#/lib/database.types'
import type { HijriSchedule } from '#/lib/schedule'
import { supabaseBrowser } from '#/lib/supabase/client'

/** A habit row, with `hijri_schedule` narrowed from the DB's raw Json to a structured shape. */
export type Habit = Omit<Tables<'habits'>, 'hijri_schedule'> & { hijri_schedule: HijriSchedule | null }
export type Stack = Tables<'habit_stacks'>

export type HabitCreate = {
  name: string
  schedule_days: number[]
  hijri_schedule: HijriSchedule | null
  target_count: number | null
  target_unit: string | null
}
export type HabitPatch = {
  name?: string
  schedule_days?: number[]
  hijri_schedule?: HijriSchedule | null
  target_count?: number | null
  target_unit?: string | null
}

export const habitsQueryOptions = () =>
  queryOptions({
    queryKey: ['habits'],
    queryFn: async (): Promise<Habit[]> => {
      const { data, error } = await supabaseBrowser.from('habits').select('*').order('position')
      if (error) throw error
      return (data ?? []) as Habit[]
    },
  })

export const stacksQueryOptions = () =>
  queryOptions({
    queryKey: ['stacks'],
    queryFn: async (): Promise<Stack[]> => {
      const { data, error } = await supabaseBrowser
        .from('habit_stacks')
        .select('*')
        .order('created_at')
      if (error) throw error
      return data ?? []
    },
  })

/** Refetch everything habit-shaped after a mutation — habits carry stack_id, so both move together. */
export function invalidateHabitData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['habits'] })
  qc.invalidateQueries({ queryKey: ['stacks'] })
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabaseBrowser.auth.getUser()
  if (error || !data.user) throw new Error('Not signed in')
  return data.user.id
}

/** The next `position` (habits are ordered by it) — append to the end of the list. */
async function nextPosition(): Promise<number> {
  const { data } = await supabaseBrowser
    .from('habits')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
  return (data?.[0]?.position ?? -1) + 1
}

export async function createHabit(input: HabitCreate): Promise<void> {
  const user_id = await requireUserId()
  const position = await nextPosition()
  const { error } = await supabaseBrowser.from('habits').insert({ ...input, user_id, position })
  if (error) throw error
}

/** Bulk create (starter set / routine members), assigning sequential positions. Returns the rows. */
export async function createHabits(inputs: HabitCreate[]): Promise<Habit[]> {
  if (inputs.length === 0) return []
  const user_id = await requireUserId()
  const base = await nextPosition()
  const rows = inputs.map((h, i) => ({ ...h, user_id, position: base + i }))
  const { data, error } = await supabaseBrowser.from('habits').insert(rows).select()
  if (error) throw error
  return (data ?? []) as Habit[]
}

export async function updateHabit(id: string, patch: HabitPatch): Promise<void> {
  const { error } = await supabaseBrowser.from('habits').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteHabit(id: string): Promise<void> {
  const { error } = await supabaseBrowser.from('habits').delete().eq('id', id)
  if (error) throw error
}

/** Create a stack (routine) and group the given habits into it, in the order supplied. */
export async function createStack(name: string, habitIds: string[]): Promise<string> {
  const user_id = await requireUserId()
  const { data, error } = await supabaseBrowser
    .from('habit_stacks')
    .insert({ name, user_id })
    .select('id')
    .single()
  if (error) throw error
  if (habitIds.length > 0) {
    const { error: e2 } = await supabaseBrowser.from('habits').update({ stack_id: data.id }).in('id', habitIds)
    if (e2) throw e2
  }
  return data.id
}

/** Ungroup a routine: detach its member habits (keep them), then delete the stack. */
export async function deleteStack(id: string): Promise<void> {
  await supabaseBrowser.from('habits').update({ stack_id: null }).eq('stack_id', id)
  const { error } = await supabaseBrowser.from('habit_stacks').delete().eq('id', id)
  if (error) throw error
}
