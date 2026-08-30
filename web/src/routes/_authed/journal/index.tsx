import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PenLine } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState, ListSkeleton, PageHeader, RowCard, RowList, Section } from '#/components/console'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { hijriParts, localDate, todayLocalISO } from '#/lib/dates'
import { journalMonths, noteExcerpt, notesQueryOptions, wordCount, type JournalEntry } from '#/lib/notes'
import { countLabel } from '#/lib/utils'

export const Route = createFileRoute('/_authed/journal/')({ component: JournalPage })

/**
 * The archive the phone has never had: every reflection, filed under the Hijri month it
 * belongs to. Small enough to load whole and filter in the browser — if it ever runs to
 * hundreds, move the filter to a Postgres `ilike` rather than paging this list.
 */
function JournalPage() {
  const { data, isPending } = useQuery(notesQueryOptions())
  const [filter, setFilter] = useState('')

  // Resolved after mount: the SSR clock and the reader's disagree across midnight.
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(todayLocalISO()), [])

  const entries = data ?? []
  const needle = filter.trim().toLowerCase()
  const matching = needle
    ? entries.filter((e) => e.body.toLowerCase().includes(needle) || e.note_date.includes(needle))
    : entries
  const months = journalMonths(matching)
  const words = entries.reduce((total, entry) => total + wordCount(entry.body), 0)
  const writtenToday = today !== null && entries.some((entry) => entry.note_date === today)

  return (
    <div>
      <PageHeader
        title="Journal"
        readout={
          isPending
            ? undefined
            : `${countLabel(entries.length, 'reflection')} · ${words.toLocaleString()} words`
        }
        action={
          today && (
            <Button asChild>
              <Link to="/journal/$day" params={{ day: today }}>
                <PenLine className="mr-1 size-4" />
                {writtenToday ? 'Today’s reflection' : 'Write today'}
              </Link>
            </Button>
          )
        }
      />

      {entries.length > 0 && (
        <div className="rise-in mb-6 max-w-sm">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Search your reflections"
            aria-label="Search your reflections"
          />
        </div>
      )}

      {isPending ? (
        <ListSkeleton rows={5} />
      ) : entries.length === 0 ? (
        <EmptyState title="Nothing written yet">
          A reflection is a few lines about the day — what was easy, what was hard, what stayed
          with you. Write today’s here, or on your phone.
        </EmptyState>
      ) : months.length === 0 ? (
        <EmptyState title="No reflection matches that">
          Try a shorter word, or a date like {today ?? '2026-08-30'}.
        </EmptyState>
      ) : (
        <div className="grid gap-8">
          {months.map((month) => (
            <Section key={month.key} title={month.label} count={month.entries.length}>
              <RowList>
                {month.entries.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} today={today} />
                ))}
              </RowList>
            </Section>
          ))}
        </div>
      )}
    </div>
  )
}

function EntryRow({ entry, today }: { entry: JournalEntry; today: string | null }) {
  const date = localDate(entry.note_date)
  const dayNumber = hijriParts(entry.note_date)?.day ?? date.getDate()
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' })
  const words = wordCount(entry.body)

  return (
    <Link to="/journal/$day" params={{ day: entry.note_date }} className="block">
      <RowCard className="items-center gap-4 py-3.5">
        <div className="w-10 shrink-0 text-center">
          <div className="display-title text-lg leading-none text-foreground tabular-nums">
            {dayNumber}
          </div>
          <div className="mt-1 text-[0.68rem] uppercase tracking-wide text-muted-foreground">
            {weekday}
          </div>
        </div>
        <p className="min-w-0 flex-1 truncate text-sm text-foreground">{noteExcerpt(entry.body)}</p>
        {entry.note_date === today && (
          <Badge variant="outline" className="shrink-0 border-border text-muted-foreground">
            Today
          </Badge>
        )}
        <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">
          {countLabel(words, 'word')}
        </span>
      </RowCard>
    </Link>
  )
}
