import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClientOnly, createFileRoute, Link, redirect, useHydrated } from '@tanstack/react-router'
import {
  AlignCenterVertical,
  ChevronLeft,
  ChevronRight,
  Focus,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { FormError, Panel } from '#/components/page'
import { Button } from '#/components/ui/button'
import { Toggle as UIToggle } from '#/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip'
import { Skeleton } from '#/components/ui/skeleton'
import { addDaysISO, formatGregorian, formatHijriDate, localDate, todayLocalISO } from '#/lib/dates'
import {
  MAX_NOTE_LENGTH,
  clampBody,
  invalidateNotes,
  noteQueryOptions,
  notesConsentQueryOptions,
  readingMinutes,
  saveNote,
  wordCount,
  type JournalEntry,
} from '#/lib/notes'
import { cn } from '#/lib/utils'

const JournalEditor = lazy(() => import('#/components/journal/editor'))

const DAY = /^\d{4}-\d{2}-\d{2}$/
const AUTOSAVE_MS = 800

/** A real calendar day. `2026-02-30` is digit-shaped but `Date` silently rolls it into March,
 *  which would head the page with one date, save under another, and be rejected by Postgres. */
function isRealDay(value: string): boolean {
  if (!DAY.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const Route = createFileRoute('/_authed/journal/$day')({
  beforeLoad: ({ params }) => {
    if (!isRealDay(params.day)) throw redirect({ to: '/journal' })
  },
  component: DayPage,
})

/** Keyed on the day so stepping to another date rebuilds the editor and resets its refs. */
function DayPage() {
  const { day } = Route.useParams()
  return <DayEditor key={day} day={day} />
}

type SaveState =
  | { status: 'idle' }
  | { status: 'dirty' }
  | { status: 'saving' }
  | { status: 'saved'; at: Date }
  | { status: 'error'; message: string }
  | { status: 'conflict' }

function DayEditor({ day }: { day: string }) {
  const qc = useQueryClient()
  const { data: note, isPending, isError } = useQuery(noteQueryOptions(day))
  const { data: consented } = useQuery(notesConsentQueryOptions())

  const [body, setBody] = useState('')
  const [ready, setReady] = useState(false)
  const [save, setSave] = useState<SaveState>({ status: 'idle' })
  const [focusMode, setFocusMode] = useState(true)
  const [typewriter, setTypewriter] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // The clock only decides whether *forward* is allowed. The page itself is named by the URL,
  // and its Hijri heading formats through an explicit locale, so that much is SSR-safe.
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(todayLocalISO()), [])
  const hydrated = useHydrated()

  const text = useRef('')
  const written = useRef('') // the body the database holds, as we last left it
  const known = useRef<JournalEntry | null>(null) // the row itself — the guard every write is conditional on
  const conflicted = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed once, when the day's reflection arrives. A failed read must NOT seed: an empty sheet
  // would look exactly like a day never written, and saving over it would replace real text.
  useEffect(() => {
    if (ready || isPending || isError) return
    const loaded = note?.body ?? ''
    text.current = loaded
    written.current = loaded
    known.current = note ?? null
    setBody(loaded)
    setReady(true)
  }, [ready, isPending, isError, note])

  const runSave = useCallback(
    async (force: boolean) => {
      if (conflicted.current && !force) return
      const next = clampBody(text.current.trim())
      if (!force && next === written.current) return
      setSave({ status: 'saving' })
      try {
        const outcome = await saveNote(day, text.current, known.current)
        if (!outcome.ok) {
          conflicted.current = true
          setSave({ status: 'conflict' })
          return
        }
        known.current = outcome.note
        written.current = next
        conflicted.current = false
        setSave({ status: 'saved', at: new Date() })
        // Write the saved row straight into this day's cache. Without it the cache still holds
        // the pre-save row, and coming back to the day inside react-query's gcTime would seed
        // the editor from stale text whose stamp then loses every future write.
        qc.setQueryData(noteQueryOptions(day).queryKey, outcome.note)
        invalidateNotes(qc)
      } catch (error) {
        setSave({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not save this reflection.',
        })
      }
    },
    [day, qc],
  )

  // Saves run strictly one at a time. Every write is conditional on the `updated_at` it last
  // saw, so a debounced save overlapping a blur-flush would have the second one report a
  // conflict against its own sibling.
  const queue = useRef<Promise<void>>(Promise.resolve())
  const flush = useCallback(
    (force = false) => {
      const next = queue.current.then(() => runSave(force))
      queue.current = next.catch(() => undefined)
      return next
    },
    [runSave],
  )

  const flushNow = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    void flush()
  }, [flush])

  // Held in a ref so the unmount and visibility handlers below never call a stale save.
  const flushRef = useRef(flushNow)
  useEffect(() => {
    flushRef.current = flushNow
  })

  // Leaving the page — a client-side navigation included — writes whatever is pending.
  useEffect(() => {
    return () => {
      flushRef.current()
    }
  }, [])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushRef.current()
    }
    // A closing tab cannot be relied on to finish an authenticated request, so warn instead
    // of pretending to save. The window this covers is at most one autosave interval.
    const onUnload = (event: BeforeUnloadEvent) => {
      if (text.current.trim() !== written.current) event.preventDefault()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])

  const onChange = useCallback(
    (next: string) => {
      text.current = next
      setBody(next)
      if (conflicted.current) return
      setSave({ status: 'dirty' })
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        void flush()
      }, AUTOSAVE_MS)
    },
    [flush],
  )

  async function resolveConflict(keep: 'mine' | 'theirs') {
    const fresh = await qc.fetchQuery(noteQueryOptions(day))
    known.current = fresh ?? null
    conflicted.current = false
    if (keep === 'mine') {
      await flush(true)
      return
    }
    const loaded = fresh?.body ?? ''
    text.current = loaded
    written.current = loaded
    setBody(loaded)
    setReloadKey((key) => key + 1)
    setSave({ status: 'idle' })
  }

  // Both toggles are read after mount, never during render: `localStorage` does not exist on
  // the server, so seeding state from it would hydrate to a value the server never sent.
  const settled = useRef(false)
  useEffect(() => {
    setFocusMode(readToggle('focus', true))
    setTypewriter(readToggle('typewriter', false))
    settled.current = true
  }, [])
  useEffect(() => {
    if (settled.current) writeToggle('focus', focusMode)
  }, [focusMode])
  useEffect(() => {
    if (settled.current) writeToggle('typewriter', typewriter)
  }, [typewriter])

  useEffect(() => {
    if (!fullscreen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const words = wordCount(body)
  // Never claim a privacy guarantee we have not confirmed: while the consent read is in flight
  // (or has failed) `consented` is undefined, and the Worker may well be feeding this text to
  // the model. Say only the part that is unconditionally true.
  const insightLine =
    consented === undefined
      ? 'Private to you.'
      : consented
        ? 'Private to you. May inform your quarterly insights.'
        : 'Private to you. Not used in insights.'
  const hijri = formatHijriDate(day)
  const gregorian = formatGregorian(day)
  const weekday = localDate(day).toLocaleDateString(undefined, { weekday: 'long' })
  const atToday = today !== null && day >= today

  return (
    <div>
      <header className="mb-6">
        <Link to="/journal" className="text-xs text-muted-foreground transition-colors hover:text-foreground">
          ← Journal
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {hijri ?? gregorian}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {/* Weekday and Gregorian date resolve against the ambient locale, which on the
                  Worker is not the reader's — rendering them server-side is a hydration
                  mismatch on every non-English visit. The Hijri heading above is unaffected:
                  it formats through an explicit locale and a hardcoded month table. */}
              {hydrated && `${weekday}${hijri ? ` · ${gregorian}` : ''} · `}
              {insightLine}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="icon-sm" asChild aria-label="Previous day">
              <Link to="/journal/$day" params={{ day: addDaysISO(day, -1) }}>
                <ChevronLeft />
              </Link>
            </Button>
            {atToday ? (
              <Button variant="ghost" size="icon-sm" disabled aria-label="Next day">
                <ChevronRight />
              </Button>
            ) : (
              <Button variant="ghost" size="icon-sm" asChild aria-label="Next day">
                <Link to="/journal/$day" params={{ day: addDaysISO(day, 1) }}>
                  <ChevronRight />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {save.status === 'conflict' && (
        <Panel className="mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
          <p className="text-sm text-foreground">
            This reflection changed on your phone. Nothing has been overwritten.
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="xs" onClick={() => void resolveConflict('theirs')}>
              Load the phone’s
            </Button>
            <Button size="xs" onClick={() => void resolveConflict('mine')}>
              Keep what I wrote
            </Button>
          </div>
        </Panel>
      )}

      <section
        className={cn(
          'flex flex-col rounded-xl border bg-card text-card-foreground',
          fullscreen
            ? 'fixed inset-0 z-50 rounded-none border-0 px-5 py-6 sm:px-8'
            : 'px-5 py-7 sm:px-10 sm:py-9',
        )}
      >
        <div
          className={cn(
            'mx-auto w-full max-w-[68ch] flex-1',
            fullscreen ? 'min-h-0' : 'h-[calc(100svh-26rem)] min-h-[20rem]',
          )}
        >
          {isError && !ready ? (
            <div className="grid justify-items-start gap-3">
              <FormError message="Could not load this reflection. Nothing has been changed." />
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void qc.invalidateQueries({ queryKey: noteQueryOptions(day).queryKey })}
              >
                Try again
              </Button>
            </div>
          ) : ready ? (
            <ClientOnly fallback={<StaticSheet body={body} />}>
              <Suspense fallback={<StaticSheet body={body} />}>
                <JournalEditor
                  key={reloadKey}
                  initialBody={body}
                  focus={focusMode}
                  typewriter={typewriter}
                  onChange={onChange}
                  onBlur={flushNow}
                  onSave={flushNow}
                />
              </Suspense>
            </ClientOnly>
          ) : (
            <div className="grid gap-3">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-[92%]" />
              <Skeleton className="h-5 w-[64%]" />
            </div>
          )}
        </div>

        <div className="mx-auto mt-6 flex w-full max-w-[68ch] flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
          <span className="text-xs text-muted-foreground tabular-nums">
            {words} {words === 1 ? 'word' : 'words'} · {readingMinutes(words)} min
          </span>
          <span
            className={cn(
              'text-xs text-muted-foreground tabular-nums',
              body.length > MAX_NOTE_LENGTH - 200 && 'text-destructive',
            )}
          >
            {body.length}/{MAX_NOTE_LENGTH}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">{saveLabel(save)}</span>
          <div className="flex items-center gap-0.5">
            <Toggle
              on={focusMode}
              label="Focus mode"
              onClick={() => setFocusMode((value) => !value)}
              icon={<Focus />}
            />
            <Toggle
              on={typewriter}
              label="Typewriter scrolling"
              onClick={() => setTypewriter((value) => !value)}
              icon={<AlignCenterVertical />}
            />
            <Toggle
              on={fullscreen}
              label={fullscreen ? 'Leave full screen' : 'Full screen'}
              onClick={() => setFullscreen((value) => !value)}
              icon={fullscreen ? <Minimize2 /> : <Maximize2 />}
            />
          </div>
        </div>

        {save.status === 'error' && (
          <div className="mx-auto mt-3 flex w-full max-w-[68ch] items-center gap-3">
            <FormError message={save.message} />
            <Button variant="ghost" size="xs" onClick={flushNow}>
              Try again
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

/** An editor mode switch: pressed state comes from the primitive, the name from a tooltip. */
function Toggle({
  on,
  label,
  icon,
  onClick,
}: {
  on: boolean
  label: string
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <UIToggle
          size="sm"
          pressed={on}
          onPressedChange={onClick}
          aria-label={label}
          className="text-muted-foreground data-[state=on]:text-foreground"
        >
          {icon}
        </UIToggle>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** What the sheet shows before CodeMirror arrives: the same text at the same metrics, so
 *  nothing shifts when the editor takes over. */
function StaticSheet({ body }: { body: string }) {
  return (
    <pre className="m-0 h-full overflow-hidden whitespace-pre-wrap break-words font-sans text-[1.1875rem] leading-[1.75] text-foreground">
      {body}
    </pre>
  )
}

function saveLabel(save: SaveState): string {
  switch (save.status) {
    case 'saving':
      return 'Saving…'
    case 'saved':
      return `Saved ${save.at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
    case 'dirty':
      return 'Unsaved'
    case 'conflict':
      return 'Not saved'
    case 'error':
      return 'Save failed'
    default:
      return ''
  }
}

const KEYS = { focus: 'qamar.journal.focus', typewriter: 'qamar.journal.typewriter' } as const

// Both are only ever called from an effect, so `window` is always there; the try/catch is for
// a browser set to refuse site data, which throws on access rather than returning null.
function readToggle(name: keyof typeof KEYS, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(KEYS[name])
    return stored === null ? fallback : stored === '1'
  } catch {
    return fallback
  }
}

function writeToggle(name: keyof typeof KEYS, value: boolean) {
  try {
    window.localStorage.setItem(KEYS[name], value ? '1' : '0')
  } catch {
    // Refusing to remember a toggle is not a reason to stop working.
  }
}
