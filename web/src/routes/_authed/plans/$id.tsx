import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { CalendarPlus, ChevronLeft, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Field, FormDialog, FormError, Panel } from '#/components/console'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Skeleton } from '#/components/ui/skeleton'
import { Textarea } from '#/components/ui/textarea'
import { addDaysISO, todayLocalISO } from '#/lib/dates'
import {
  deletePlan,
  invalidatePlans,
  MAX_PLAN_BODY,
  MAX_PLAN_TITLE,
  planQueryOptions,
  planTasksQueryOptions,
  savePlan,
  schedulePlan,
  scheduledLabel,
  type Plan,
} from '#/lib/plans'

const AUTOSAVE_MS = 800
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/_authed/plans/$id')({
  // A plan id is a uuid. Anything else cannot name a row, and letting it through would spend a
  // round trip to render an empty editor over nothing.
  beforeLoad: ({ params }) => {
    if (!UUID.test(params.id)) throw redirect({ to: '/plans' })
  },
  component: PlanPage,
})

/** Keyed on the id so opening another plan rebuilds the editor and resets its refs. */
function PlanPage() {
  const { id } = Route.useParams()
  return <PlanEditor key={id} id={id} />
}

type SaveState =
  | { status: 'idle' }
  | { status: 'dirty' }
  | { status: 'saving' }
  | { status: 'saved'; at: Date }
  | { status: 'error'; message: string }
  | { status: 'conflict' }

/**
 * One plan: what it is, and the notes behind it.
 *
 * The notes are why this page exists — writing ten lines about a trip is work for a keyboard. So
 * it borrows the journal's save machinery wholesale: a debounced write, a strictly serialized
 * queue, and every write conditional on the row exactly as it was last read. The phone edits these
 * same rows, which is precisely the case that guard is for.
 *
 * What it does not borrow is the writing surface. A plan's body is a list of things you thought
 * of, not prose — a plain textarea is right, and CodeMirror would be a lot of bundle for a page
 * that does not need a caret ruler.
 */
function PlanEditor({ id }: { id: string }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data: plan, isPending, isError } = useQuery(planQueryOptions(id))
  const { data: planTasks } = useQuery(planTasksQueryOptions())

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [ready, setReady] = useState(false)
  const [save, setSave] = useState<SaveState>({ status: 'idle' })
  const [confirming, setConfirming] = useState(false)

  // Resolved after mount: the SSR clock and the reader's disagree across midnight.
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(todayLocalISO()), [])

  const draft = useRef({ title: '', body: '' })
  const known = useRef<Plan | null>(null) // the row itself — the guard every write is conditional on
  const conflicted = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Set the moment this plan is deleted from here, and never cleared. The unmount flush below runs
  // on the navigation the delete itself triggers, and without this it would save the row it just
  // removed — writing the deleted plan back into the cache.
  const removed = useRef(false)

  // The read succeeded and there is no such plan: deleted here and reopened with Back, or deleted
  // on the phone with this tab still on it. `maybeSingle()` reports that as `null`, not an error,
  // so without naming it the seed below simply never runs and the skeleton never resolves.
  const gone = !isPending && !isError && plan == null

  // Seed once, when the plan arrives. A failed read must NOT seed: empty fields would look exactly
  // like a plan with nothing in it, and saving over them would replace real notes.
  useEffect(() => {
    if (ready || isPending || isError || !plan) return
    draft.current = { title: plan.title, body: plan.body }
    known.current = plan
    setTitle(plan.title)
    setBody(plan.body)
    setReady(true)
  }, [ready, isPending, isError, plan])

  const runSave = useCallback(
    async (force: boolean) => {
      const row = known.current
      if (!row || removed.current) return
      if (conflicted.current && !force) return
      setSave({ status: 'saving' })
      try {
        const outcome = await savePlan(row, draft.current)
        // `null` is an empty title, refused before it was sent — the last good name still stands,
        // and a reader mid-word should not be told their plan failed to save.
        if (outcome === null) return
        if (!outcome.ok) {
          conflicted.current = true
          setSave({ status: 'conflict' })
          return
        }
        known.current = outcome.plan
        conflicted.current = false
        setSave({ status: 'saved', at: new Date() })
        // Write the saved row straight into this plan's cache. Without it the cache still holds
        // the pre-save row, and coming back inside react-query's gcTime would seed the editor from
        // a stale stamp that then loses every future write.
        qc.setQueryData(planQueryOptions(id).queryKey, outcome.plan)
        invalidatePlans(qc)
      } catch (error) {
        setSave({
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not save this plan.',
        })
      }
    },
    [id, qc],
  )

  // Saves run strictly one at a time: every write is conditional on the `updated_at` it last saw,
  // so a debounced save overlapping a blur-flush would have the second report a conflict against
  // its own sibling.
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
      if (!removed.current) flushRef.current()
    }
  }, [])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushRef.current()
    }
    // A closing tab cannot be relied on to finish an authenticated request, so warn instead of
    // pretending to save. The window this covers is at most one autosave interval.
    // Compared the way `savePlan` stores them. Against the raw draft, one trailing space in the
    // title would read as an unsaved edit for the life of the page: every reload warned about,
    // every navigation paying for a write that changes nothing.
    const onUnload = (event: BeforeUnloadEvent) => {
      const row = known.current
      if (!row || removed.current) return
      if (draft.current.title.trim() !== row.title || draft.current.body.trim() !== row.body) {
        event.preventDefault()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [])

  const edit = useCallback(
    (patch: Partial<{ title: string; body: string }>) => {
      draft.current = { ...draft.current, ...patch }
      if (patch.title !== undefined) setTitle(patch.title)
      if (patch.body !== undefined) setBody(patch.body)
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
    const fresh = await qc.fetchQuery(planQueryOptions(id))
    conflicted.current = false
    // Gone, not moved: there is no row left to write back to, so neither answer can be honoured.
    // Say so and leave the text on screen — it is the only copy of it there is.
    if (!fresh) {
      known.current = null
      setSave({
        status: 'error',
        message: 'This plan was deleted somewhere else. Your writing is still here — copy anything you want to keep.',
      })
      return
    }
    known.current = fresh
    if (keep === 'mine') {
      await flush(true)
      return
    }
    draft.current = { title: fresh?.title ?? '', body: fresh?.body ?? '' }
    setTitle(draft.current.title)
    setBody(draft.current.body)
    setSave({ status: 'idle' })
  }

  const schedule = useMutation({
    mutationFn: async (dueOn: string) => {
      // The to-do takes the plan's title, so any pending rename is committed before it is copied.
      await flush()
      const row = known.current
      if (row) await schedulePlan(row, dueOn)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan-tasks'] }),
  })

  const remove = useMutation({
    mutationFn: () => deletePlan(id),
    onSuccess: () => {
      removed.current = true
      qc.removeQueries({ queryKey: planQueryOptions(id).queryKey })
      invalidatePlans(qc)
      void navigate({ to: '/plans' })
    },
  })

  const mine = (planTasks ?? []).filter((task) => task.plan_id === id)
  const tomorrow = today && addDaysISO(today, 1)
  // A day this plan has already put an open to-do on. `<=` for today, matching `scheduledLabel`
  // and the phone: an overdue to-do carries forward, so it is sitting on today whatever its date.
  // Without this the buttons stay live and a second click writes a title nobody retyped — the
  // duplication `createTask`'s in-flight guard exists to prevent on the other surface.
  const heldToday = today != null && mine.some((task) => task.due_on <= today)
  const heldTomorrow = tomorrow != null && mine.some((task) => task.due_on === tomorrow)

  return (
    <div className="grid gap-6">
      <div className="rise-in flex items-center justify-between gap-4">
        <Link to="/plans" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          Plans
        </Link>
        <span className="metric-label">{saveLabel(save)}</span>
      </div>

      {isError ? (
        <FormError message="Could not load this plan. Reload the page to try again." />
      ) : gone ? (
        <Panel className="grid justify-items-start gap-3 px-5 py-6">
          <p className="text-sm text-foreground">This plan is no longer here. It was deleted.</p>
          <Button size="sm" variant="outline" asChild>
            <Link to="/plans">Back to plans</Link>
          </Button>
        </Panel>
      ) : !ready ? (
        <div className="grid gap-4">
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      ) : (
        <>
          {save.status === 'conflict' && (
            <Panel className="grid gap-3 px-5 py-4">
              <p className="text-sm text-foreground">
                This plan changed somewhere else — on your phone, or in another tab — while you were
                writing. Nothing has been overwritten.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void resolveConflict('mine')}>
                  Keep what I wrote
                </Button>
                <Button size="sm" variant="outline" onClick={() => void resolveConflict('theirs')}>
                  Use the other version
                </Button>
              </div>
            </Panel>
          )}

          <Panel className="rise-in grid gap-5 px-5 py-6 sm:px-8 sm:py-7">
            <Field label="Title" htmlFor="plan-title">
              <Input
                id="plan-title"
                value={title}
                onChange={(event) => edit({ title: event.target.value })}
                onBlur={flushNow}
                maxLength={MAX_PLAN_TITLE}
                placeholder="What is it?"
              />
            </Field>
            <Field label="Notes" htmlFor="plan-body">
              <Textarea
                id="plan-body"
                value={body}
                onChange={(event) => edit({ body: event.target.value })}
                onBlur={flushNow}
                maxLength={MAX_PLAN_BODY}
                rows={16}
                className="min-h-[22rem] leading-relaxed"
                placeholder="Anything worth remembering about it."
              />
            </Field>
            <p className="metric-label">
              {body.length.toLocaleString()}/{MAX_PLAN_BODY.toLocaleString()}
            </p>
          </Panel>

          <Panel className="rise-in grid gap-4 px-5 py-5 sm:px-8">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Add as a to-do</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                It appears in the app, on the day you choose. The plan stays here either way.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!today || heldToday || schedule.isPending}
                onClick={() => today && schedule.mutate(today)}
              >
                <CalendarPlus className="mr-1 size-4" />
                {heldToday ? 'On today’s list' : 'Today'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!tomorrow || heldTomorrow || schedule.isPending}
                onClick={() => tomorrow && schedule.mutate(tomorrow)}
              >
                <CalendarPlus className="mr-1 size-4" />
                {heldTomorrow ? 'On tomorrow’s list' : 'Tomorrow'}
              </Button>
            </div>
            <FormError message={schedule.isError ? 'Could not add that to-do. Check your connection.' : null} />
            {mine.length > 0 && today != null && (
              <ul className="grid gap-1.5 border-t border-border pt-4">
                {mine.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-foreground">{task.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {scheduledLabel(task.due_on, today)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="mr-1 size-4" />
              Delete plan
            </Button>
          </div>
          <FormError message={remove.isError ? 'Could not delete that. Check your connection.' : null} />

          {/* A plan can hold four thousand characters of notes, and there is no undo. The habits
              page deletes a row on one click, which is survivable for a name and a schedule; this
              is not the same thing. The phone asks too. */}
          <FormDialog open={confirming} onClose={() => setConfirming(false)} title="Delete plan">
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                “{known.current?.title ?? title}” and its notes will be deleted. Anything it has
                already put on a list stays there.
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-destructive text-white hover:bg-destructive/90"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? 'Deleting…' : 'Delete'}
                </Button>
              </div>
            </div>
          </FormDialog>
        </>
      )}
    </div>
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
