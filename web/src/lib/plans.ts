import { queryOptions, type QueryClient } from '@tanstack/react-query'

import type { Tables } from '#/lib/database.types'
import { addDaysISO, formatDayShort } from '#/lib/dates'
import { clampBody } from '#/lib/notes'
import { requireUserId, supabaseBrowser } from '#/lib/supabase/client'

/**
 * A plan: something you mean to do, before any of it has a day.
 *
 * The phone writes these too, which is what shapes everything careful in this file. A plan is the
 * first row in this product edited from two clients at once, so every write here is conditional on
 * the row exactly as it was last read — the same guard {@link import('./notes').saveNote} uses,
 * for the same reason. The database moves `updated_at` on every update through a trigger, so the
 * token is trustworthy whichever client wrote last.
 *
 * The DB enforces `char_length(trim(title)) between 1 and 200` and `char_length(body) <= 4000`,
 * which shapes two rules the UI cannot opt out of: a plan can never be saved without a title (so a
 * new one is named before it exists, rather than created empty at a URL the way a reflection is),
 * and the notes are clamped before they are ever sent.
 */
export type Plan = Tables<'plans'>

/** Matches the `plans` body check. The same ceiling a reflection keeps. */
export const MAX_PLAN_BODY = 4000
/** Matches the `plans` title check. */
export const MAX_PLAN_TITLE = 200

/** An open to-do pulled from a plan — what lets a plan say where its last one went. */
export type PlanTask = Pick<Tables<'tasks'>, 'id' | 'title' | 'due_on' | 'plan_id'>

export const plansQueryOptions = () =>
  queryOptions({
    queryKey: ['plans'],
    queryFn: async (): Promise<Plan[]> => {
      const { data, error } = await supabaseBrowser.from('plans').select('*').order('position')
      if (error) throw error
      return data ?? []
    },
  })

export const planQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['plans', id],
    queryFn: async (): Promise<Plan | null> => {
      const { data, error } = await supabaseBrowser.from('plans').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data
    },
  })

/**
 * The open to-dos that came out of a plan. Ordered by day, so the first one a plan finds is the
 * soonest — which is the one worth telling you about.
 */
export const planTasksQueryOptions = () =>
  queryOptions({
    queryKey: ['plan-tasks'],
    queryFn: async (): Promise<PlanTask[]> => {
      const { data, error } = await supabaseBrowser
        .from('tasks')
        .select('id,title,due_on,plan_id')
        .not('plan_id', 'is', null)
        .is('done_on', null)
        .order('due_on')
      if (error) throw error
      return data ?? []
    },
  })

/**
 * Refetch the list after a write. Exact-match on purpose: an open plan is kept current by the
 * editor that owns it, and a prefix invalidation would refetch it on every autosave.
 */
export function invalidatePlans(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['plans'], exact: true })
}

export type SaveOutcome = { ok: true; plan: Plan } | { ok: false; reason: 'conflict' }

/**
 * Rewrite a plan, but only if it is still the row we last read.
 *
 * An empty title is refused here rather than sent: the column would reject it with a constraint
 * violation, and an autosave firing mid-word through an empty field is not an error the reader
 * should ever be shown. The last good title simply stands until there is a new one.
 */
export async function savePlan(
  known: Plan,
  patch: { title: string; body: string },
): Promise<SaveOutcome | null> {
  const title = patch.title.trim().slice(0, MAX_PLAN_TITLE)
  if (title === '') return null
  // Trimmed, because the phone trims (`use-plans.tsx`). If the two clients disagreed here, a
  // body saved with a trailing newline on one would read as an unsaved edit on the other, and
  // its Save button would be live on a plan nobody had touched.
  const body = clampBody(patch.body.trim(), MAX_PLAN_BODY)
  if (title === known.title && body === known.body) return { ok: true, plan: known }

  // `id` is the primary key and RLS already scopes it to this user, so no user filter is needed —
  // which also keeps an autosave from paying for an `auth.getUser()` round trip.
  const { data, error } = await unchanged(
    supabaseBrowser.from('plans').update({ title, body }).eq('id', known.id),
    known,
  )
    .select('*')
    .maybeSingle()
  if (error) throw error
  return data ? { ok: true, plan: data } : { ok: false, reason: 'conflict' }
}

/** Narrow a write to the row exactly as we last read it. `null` needs `is`, not `eq`. */
function unchanged<T extends { eq(column: 'updated_at', value: string): T; is(column: 'updated_at', value: null): T }>(
  query: T,
  known: Plan,
): T {
  return known.updated_at === null ? query.is('updated_at', null) : query.eq('updated_at', known.updated_at)
}

export async function createPlan(title: string): Promise<Plan> {
  const user_id = await requireUserId()
  const position = await nextPosition()
  const { data, error } = await supabaseBrowser
    .from('plans')
    .insert({ user_id, title: title.trim().slice(0, MAX_PLAN_TITLE), position })
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await supabaseBrowser.from('plans').delete().eq('id', id)
  if (error) throw error
}

/** The next `position` — append to the foot of the list, as `habits.ts` does for an act. */
async function nextPosition(): Promise<number> {
  const { data } = await supabaseBrowser.from('plans').select('position').order('position', { ascending: false }).limit(1)
  return (data?.[0]?.position ?? -1) + 1
}

/**
 * Put a to-do on a day, carrying the plan it came from.
 *
 * `position` is read rather than left to default: the column defaults to `0`, and the phone hands
 * out a running counter, so an insert that took the default would sort ahead of every to-do ever
 * written there.
 */
export async function schedulePlan(plan: Plan, dueOn: string): Promise<void> {
  const user_id = await requireUserId()
  const { data } = await supabaseBrowser
    .from('tasks')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
  const { error } = await supabaseBrowser.from('tasks').insert({
    user_id,
    title: plan.title,
    due_on: dueOn,
    plan_id: plan.id,
    position: (data?.[0]?.position ?? -1) + 1,
  })
  if (error) throw error
}

/**
 * Where a to-do pulled from a plan is sitting.
 *
 * Only today and tomorrow can be chosen, so those are the two that read naturally. A `due_on` at
 * or before today is "today": that is where an open to-do actually appears on the phone, whether
 * it is its own day or it has carried forward.
 */
export function scheduledLabel(dueOn: string, today: string): string {
  if (dueOn <= today) return 'On today’s list'
  if (dueOn === addDaysISO(today, 1)) return 'On tomorrow’s list'
  return `On the list for ${formatDayShort(dueOn)}`
}

/**
 * The first line of the notes, for the second line of a row. `null` for an empty body, so a plan
 * that is still only a name renders no second line rather than one holding space open.
 */
export function planExcerpt(body: string, max = 96): string | null {
  const line = body
    .split('\n')
    .map((candidate) => candidate.trim().replace(/\s+/g, ' '))
    .find((candidate) => candidate !== '')
  if (line === undefined) return null
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`
}

/** Plan id → the soonest open to-do it has put on a day. */
export function scheduledByPlan(tasks: readonly PlanTask[]): Map<string, PlanTask> {
  const byPlan = new Map<string, PlanTask>()
  for (const task of tasks) {
    if (task.plan_id === null) continue
    const held = byPlan.get(task.plan_id)
    if (held === undefined || task.due_on < held.due_on) byPlan.set(task.plan_id, task)
  }
  return byPlan
}
