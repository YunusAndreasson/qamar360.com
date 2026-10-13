import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Map, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState, Field, FormDialog, FormError, ListSkeleton, PageHeader, RowCard, RowList } from '#/components/page'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { todayLocalISO } from '#/lib/dates'
import {
  createPlan,
  invalidatePlans,
  MAX_PLAN_TITLE,
  planExcerpt,
  plansQueryOptions,
  planTasksQueryOptions,
  scheduledByPlan,
  scheduledLabel,
  type Plan,
} from '#/lib/plans'

export const Route = createFileRoute('/_authed/plans/')({ component: PlansPage })

/**
 * Plans — what you mean to do, before any of it has a day.
 *
 * The phone's three lists all hold something anchored in time; this holds what isn't. A plan is a
 * title and the notes behind it, and the notes are why this page exists at all: writing ten lines
 * about a trip is work for a keyboard, not a phone, which is the one thing this console can offer
 * that the app genuinely cannot.
 *
 * A plan is never ticked here. You pull a to-do out of it onto today or tomorrow and the plan
 * stays, so the row says where the last one went.
 */
function PlansPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data, isPending } = useQuery(plansQueryOptions())
  const { data: planTasks } = useQuery(planTasksQueryOptions())
  const [naming, setNaming] = useState(false)

  // Resolved after mount: the SSR clock and the reader's disagree across midnight.
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(todayLocalISO()), [])

  const plans = data ?? []
  const scheduled = scheduledByPlan(planTasks ?? [])

  return (
    <div>
      <PageHeader
        title="Plans"
        readout={isPending ? undefined : readout(plans.length, scheduled.size)}
        action={
          <Button onClick={() => setNaming(true)}>
            <Plus className="mr-1 size-4" />
            New plan
          </Button>
        }
      />

      {isPending ? (
        <ListSkeleton rows={4} />
      ) : plans.length === 0 ? (
        <EmptyState title="Nothing planned">
          Somewhere to keep the things you mean to do, before they have a day — a trip, a repair, a
          visit. Write the notes here, and pull a to-do out of one when it is time.
        </EmptyState>
      ) : (
        <RowList>
          {plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              today={today}
              scheduledOn={scheduled.get(plan.id)?.due_on ?? null}
            />
          ))}
        </RowList>
      )}

      <NamePlanDialog
        open={naming}
        onClose={() => setNaming(false)}
        onCreated={(plan) => {
          invalidatePlans(qc)
          void navigate({ to: '/plans/$id', params: { id: plan.id } })
        }}
      />
    </div>
  )
}

/** "6 plans · 2 on a list" — the second half only once something has actually come out of one. */
function readout(plans: number, scheduled: number): string {
  const kept = `${plans} ${plans === 1 ? 'plan' : 'plans'}`
  return scheduled === 0 ? kept : `${kept} · ${scheduled} on a list`
}

function PlanRow({ plan, today, scheduledOn }: { plan: Plan; today: string | null; scheduledOn: string | null }) {
  const excerpt = planExcerpt(plan.body)
  return (
    <Link to="/plans/$id" params={{ id: plan.id }} className="block">
      <RowCard className="items-center gap-4 py-3.5">
        <Map className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">{plan.title}</p>
          {excerpt != null && <p className="mt-1 truncate text-xs text-muted-foreground">{excerpt}</p>}
        </div>
        {scheduledOn != null && today != null && (
          <Badge variant="secondary" className="shrink-0">
            {scheduledLabel(scheduledOn, today)}
          </Badge>
        )}
      </RowCard>
    </Link>
  )
}

/**
 * A plan is named before it exists.
 *
 * A plan's identity is its title, and the column refuses an empty one — so there is nothing to
 * create until there is a name.
 */
function NamePlanDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (plan: Plan) => void
}) {
  const [title, setTitle] = useState('')
  const create = useMutation({
    mutationFn: () => createPlan(title),
    onSuccess: (plan) => {
      setTitle('')
      onClose()
      onCreated(plan)
    },
  })

  return (
    <FormDialog open={open} onClose={onClose} title="New plan">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (title.trim()) create.mutate()
        }}
      >
        <Field label="What is it?" htmlFor="plan-title">
          <Input
            id="plan-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={MAX_PLAN_TITLE}
            placeholder="Denmark with the family"
            autoFocus
          />
        </Field>
        <FormError message={create.isError ? 'Could not create that. Check your connection.' : null} />
        <Button type="submit" disabled={!title.trim() || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      </form>
    </FormDialog>
  )
}
