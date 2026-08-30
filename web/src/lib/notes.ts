import { queryOptions, type QueryClient } from '@tanstack/react-query'

import type { Tables } from '#/lib/database.types'
import { hijriParts, localDate } from '#/lib/dates'
import { requireUserId, supabaseBrowser } from '#/lib/supabase/client'

/**
 * A day's reflection. One row per (user, day) — the same `daily_notes` table the phone
 * writes and the insights Worker reads, so `body` stays plain text on every surface.
 *
 * The DB enforces `char_length(trim(body)) between 1 and 4000`, which shapes two rules the
 * UI cannot opt out of: a reflection can never be saved blank (emptying one deletes the
 * row), and text is clamped to {@link MAX_NOTE_LENGTH} before it is ever sent.
 */
export type JournalEntry = Pick<Tables<'daily_notes'>, 'id' | 'note_date' | 'body' | 'updated_at'>

/** Matches the `daily_notes_body_length_check` constraint. */
export const MAX_NOTE_LENGTH = 4000

const COLUMNS = 'id,note_date,body,updated_at'

export const notesQueryOptions = () =>
  queryOptions({
    queryKey: ['notes'],
    queryFn: async (): Promise<JournalEntry[]> => {
      const { data, error } = await supabaseBrowser
        .from('daily_notes')
        .select(COLUMNS)
        .order('note_date', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

export const noteQueryOptions = (day: string) =>
  queryOptions({
    queryKey: ['notes', day],
    queryFn: async (): Promise<JournalEntry | null> => {
      const { data, error } = await supabaseBrowser
        .from('daily_notes')
        .select(COLUMNS)
        .eq('note_date', day)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

/**
 * Refetch the archive after a write. Exact-match on purpose: an open day is kept current by
 * the editor that owns it, and a prefix invalidation would refetch it on every autosave.
 */
export function invalidateNotes(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['notes'], exact: true })
}

/**
 * Whether reflections may feed the quarterly insights. The toggle lives on the phone; the
 * web only reports it, so a diary page always says where its text can go. RLS on `users`
 * is `auth.uid() = id`, so the bare select returns exactly the caller's row.
 */
export const notesConsentQueryOptions = () =>
  queryOptions({
    queryKey: ['notes-consent'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabaseBrowser
        .from('users')
        .select('ai_notes_consent_at,ai_notes_consent_version')
        .maybeSingle()
      if (error) throw error
      return data?.ai_notes_consent_at != null && data.ai_notes_consent_version === 1
    },
  })

/**
 * The result of a save. A conflict is an outcome, not an error: the phone writes the same
 * row, so a day open in both places can move underneath us. Network and permission
 * failures still throw.
 */
export type SaveOutcome =
  | { ok: true; note: JournalEntry | null } // null = the reflection was emptied and its row deleted
  | { ok: false; reason: 'conflict' }

/**
 * Write `body` to `day`, guarded on the row we last read (`known`, or null when the day has no
 * reflection yet). Every write is conditional on that row's `updated_at`, so a reflection saved
 * on the phone while this tab was open is reported rather than overwritten.
 *
 * The whole row is the token, not just its stamp: `updated_at` is nullable, so a null stamp
 * cannot be allowed to mean "no row" — that would have a legacy row silently refuse every write.
 */
export async function saveNote(day: string, body: string, known: JournalEntry | null): Promise<SaveOutcome> {
  const trimmed = clampBody(body.trim())

  if (known === null) {
    if (trimmed === '') return { ok: true, note: null } // nothing was ever there
    const { data, error } = await supabaseBrowser
      .from('daily_notes')
      .insert({
        user_id: await requireUserId(),
        note_date: day,
        body: trimmed,
        updated_at: new Date().toISOString(),
      })
      .select(COLUMNS)
      .single()
    // 23505 = the (user_id, note_date) unique index fired: a reflection for this day appeared
    // while we thought the day was empty.
    if (error) {
      if (error.code === '23505') return { ok: false, reason: 'conflict' }
      throw error
    }
    return { ok: true, note: data }
  }

  // `id` is the primary key and RLS already scopes it to this user, so no user filter is needed
  // — which also keeps an autosave from paying for an `auth.getUser()` round trip.
  if (trimmed === '') {
    const { data, error } = await unchanged(
      supabaseBrowser.from('daily_notes').delete().eq('id', known.id),
      known,
    ).select(COLUMNS)
    if (error) throw error
    return (data ?? []).length > 0 ? { ok: true, note: null } : { ok: false, reason: 'conflict' }
  }

  const { data, error } = await unchanged(
    supabaseBrowser
      .from('daily_notes')
      .update({ body: trimmed, updated_at: new Date().toISOString() })
      .eq('id', known.id),
    known,
  )
    .select(COLUMNS)
    .maybeSingle()
  if (error) throw error
  return data ? { ok: true, note: data } : { ok: false, reason: 'conflict' }
}

/** Narrow a write to the row exactly as we last read it. `null` needs `is`, not `eq`. */
function unchanged<T extends { eq(column: 'updated_at', value: string): T; is(column: 'updated_at', value: null): T }>(
  query: T,
  known: JournalEntry,
): T {
  return known.updated_at === null ? query.is('updated_at', null) : query.eq('updated_at', known.updated_at)
}

/**
 * Cut `body` to the length the database will accept, so a long paste clamps instead of
 * failing. Never leaves a lone high surrogate behind: half an emoji is invalid UTF-8 and
 * Postgres rejects the whole write.
 *
 * The limit counts UTF-16 units while the DB constraint counts code points, so an astral
 * character costs two here and one there — the counter can read a little pessimistic, which
 * is the safe direction.
 */
export function clampBody(body: string, max = MAX_NOTE_LENGTH): string {
  if (body.length <= max) return body
  const cut = body.slice(0, max)
  const last = cut.charCodeAt(cut.length - 1)
  const strayLeadSurrogate = last >= 0xd800 && last <= 0xdbff
  return strayLeadSurrogate ? cut.slice(0, -1) : cut
}

/** Words in a reflection: runs of non-whitespace, so punctuation and Arabic script count alike. */
export function wordCount(body: string): number {
  const trimmed = body.trim()
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length
}

/** Reading time at a calm 200 words a minute. Anything written at all reads as a minute. */
export function readingMinutes(words: number): number {
  return words === 0 ? 0 : Math.max(1, Math.ceil(words / 200))
}

/**
 * The first line of a reflection as a reader would say it aloud — heading, quote and list
 * markers dropped, paired emphasis unwrapped. Stray asterisks are left alone; this is a
 * one-line preview, not a markdown renderer.
 */
export function noteExcerpt(body: string, max = 96): string {
  const line = body.split('\n').map(spokenLine).find((candidate) => candidate !== '') ?? ''
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`
}

function spokenLine(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/, '')
    .replace(/(\*{1,3}|_{1,3}|`+)(.+?)\1/g, '$2')
    .trim()
}

/** One month of the archive: entries newest first, under the month they fall in. */
export type MonthGroup = { key: string; label: string; entries: JournalEntry[] }

/**
 * Entries bucketed by Hijri month, newest first — the archive's spine, and the same filing
 * the app's Insights use. Falls back to Gregorian months on a runtime whose `Intl` lacks
 * the Umm al-Qura calendar, so the list still groups rather than collapsing into one run.
 */
export function journalMonths(entries: JournalEntry[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>()
  const newestFirst = [...entries].sort((a, b) => b.note_date.localeCompare(a.note_date))
  for (const entry of newestFirst) {
    const { key, label } = monthOf(entry.note_date)
    const group = groups.get(key)
    if (group) group.entries.push(entry)
    else groups.set(key, { key, label, entries: [entry] })
  }
  return [...groups.values()]
}

function monthOf(iso: string): { key: string; label: string } {
  const parts = hijriParts(iso)
  if (parts) return { key: `h${parts.year}-${parts.month}`, label: `${parts.monthName} ${parts.year}` }
  const date = localDate(iso)
  return {
    key: `g${date.getFullYear()}-${date.getMonth()}`,
    label: date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  }
}
