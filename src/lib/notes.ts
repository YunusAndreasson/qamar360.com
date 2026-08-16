/**
 * The day's note — what the day was actually like.
 *
 * Every other unit on Today is countable. A stack is sealed or it isn't; an act is ticked, skipped
 * or open; a to-do is struck off or carried forward. All of them feed the lunar currency, and all
 * of them can be *finished*. A note can't. It has no schedule, no state, no completion, and nothing
 * in `lib/progress.ts` or `lib/habit-stats.ts` will ever see it — deliberately, for the same reason
 * a task is outside that math (see `lib/tasks.ts`), and one further reason of its own: the moment a
 * reflection is scored it stops being one.
 *
 * **One note per day**, appended to. The day is this app's unit — it is what the header names, what
 * the stepper moves through, what the moon grid draws — so the day's note has to be a single thing
 * you can point at. A morning thought and an evening one are two paragraphs of the same entry, not
 * two entries.
 *
 * Pure, so it can be tested: jest here matches `src/**\/*.test.ts` only, so a rule living inside a
 * component would have no test at all (the same reason {@link import('./tasks').taskRowContract}
 * sits outside `TaskRow`).
 */

import type { Tables } from '@/lib/database.types';
import { dayTitle, localDate } from '@/lib/dates';
import { foldText } from '@/lib/note-vocabulary';

/** One note row. There is at most one per `(user_id, note_date)` — the table enforces it. */
export type DailyNote = Tables<'daily_notes'>;

/** The blank line between one sitting and the next. Two newlines, so it reads as a paragraph
 *  break in the field and survives a round-trip through the textarea untouched. */
const PARAGRAPH_BREAK = '\n\n';

/**
 * Add what was just said to what was already there.
 *
 * A blank line between sittings and nothing else — no timestamp, no "— 21:40", no separator rule.
 * A diary written by hand doesn't stamp the hour on every paragraph, and the one piece of metadata
 * this app is sure of (the day) is already the row's identity. Appending inside a single sitting
 * uses the same function with a single space, because those are sentences, not sittings.
 *
 * Trims both sides so a recogniser's trailing space, or a user's stray newline, can't accumulate
 * into a growing gap at the foot of the entry across a week of appends.
 */
export function appendToBody(existing: string, addition: string, separator = PARAGRAPH_BREAK): string {
  const before = existing.trim();
  const after = addition.trim();
  if (!after) return before;
  if (!before) return after;
  return `${before}${separator}${after}`;
}

/**
 * Sentences arriving one at a time, joined the way speech actually runs.
 *
 * The recogniser hands back one punctuated sentence per pause, so the join is a single space —
 * a paragraph break here would turn every breath into its own paragraph. Where a sentence ends
 * without punctuation (the model wasn't sure, or the segment was cut at the 20-second cap) it is
 * left exactly as it came: guessing a full stop onto someone's half-finished thought is the one
 * kind of tidying this feature must never do.
 */
export function appendSpoken(existing: string, sentence: string): string {
  return appendToBody(existing, sentence, ' ');
}

/**
 * The one line the archive row shows. The note's own opening, cut at a word — never mid-word, and
 * never with the body's paragraph breaks left in, which would make a two-line row out of a
 * one-line slot.
 */
export function notePreview(body: string, max = 90): string {
  const flat = body.trim().replace(/\s+/g, ' ');
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // A single unbroken 90-character token (a URL, someone leaning on a key) has no space to cut at;
  // take the hard slice rather than returning the whole body.
  return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * How long was spoken, in the shortest honest form: "40 sec" under a minute, then whole minutes.
 * `null` for a note that was only ever typed — which renders no label at all, because "0 min"
 * would be a claim about a recording that never happened.
 *
 * Deliberately not "0:40" / "2:15": this sits beside a date in a list, where a clock-style
 * duration reads as a timestamp.
 */
export function spokenLabel(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  return `${Math.round(seconds / 60)} min`;
}

/**
 * How a note's day is titled — in the archive, and on the editor that a row opens.
 *
 * The list settings of {@link dayTitle}: never a bare weekday (three of them in a column name
 * nothing), and the year once the day leaves this one, because this is the one surface in the app
 * that can reach back years. Named here rather than inlined at the two call sites so a row and the
 * screen it opens cannot drift — which is exactly what they had done.
 */
export function noteDateTitle(noteDate: string, today: string): string {
  return dayTitle(noteDate, today, { year: true });
}

/** One month's worth of the archive: the heading, and the notes under it (newest first). */
export type NoteMonth = { key: string; label: string; notes: DailyNote[] };

/**
 * The archive, grouped into months, newest first.
 *
 * Gregorian months, not Hijri — and that is a deliberate break from the rest of the app, which
 * turns its year at Muḥarram and draws its rings on the moon. A diary is looked up by when you
 * remember writing it, and the calendar people actually remember in is the one their phone,
 * their inbox and their photographs all use. The Hijri date is still on the entry itself.
 */
export function groupByMonth(notes: readonly DailyNote[], today: string): NoteMonth[] {
  const months: NoteMonth[] = [];
  let current: NoteMonth | null = null;
  // Sorted here rather than trusted from the query: the provider serves optimistic rows too, and
  // one just written arrives at the end of the list whatever the SELECT's `order` said.
  for (const note of [...notes].sort((a, b) => b.note_date.localeCompare(a.note_date))) {
    const key = note.note_date.slice(0, 7);
    if (!current || current.key !== key) {
      const options: Intl.DateTimeFormatOptions = { month: 'long' };
      if (key.slice(0, 4) !== today.slice(0, 4)) options.year = 'numeric';
      current = {
        key,
        label: localDate(`${key}-01`).toLocaleDateString('en-US', options),
        notes: [],
      };
      months.push(current);
    }
    current.notes.push(note);
  }
  return months;
}

/**
 * Does this note answer the search?
 *
 * Folded on both sides (see {@link foldText}), which is the whole point: the app writes
 * `Alḥamdulillāh` and `duʿāʾ` with full scholarly diacritics, and nobody is going to type `ḥ` into
 * a search field. Searching "alhamdulillah" has to find it, and so does "dua".
 *
 * The date is searchable too, in the form the archive shows it — so "March" finds March, which is
 * the second thing anyone tries after a word they remember.
 */
export function matchesQuery(note: DailyNote, query: string, today: string): boolean {
  const needle = foldText(query);
  if (!needle) return true;
  return (
    foldText(note.body).includes(needle) ||
    foldText(noteDateTitle(note.note_date, today)).includes(needle) ||
    // Folded on both sides here too, and not compared raw: folding strips hyphens, so a typed
    // "2026-03" arrives as "202603" and would never be found inside "2026-03-04".
    foldText(note.note_date).includes(needle)
  );
}

/** Everything the Today row paints, resolved once and tested here rather than in the component. */
export type NoteRowContract = {
  /** `'write'` — nothing here yet, the row is an invitation; `'read'` — it holds an entry. */
  mode: 'write' | 'read';
  /** What the row says. The entry itself when there is one, otherwise the invitation. */
  text: string;
  label: string;
  hint: string;
};

/**
 * The row at the foot of the day.
 *
 * The invitation is a **question**, and only on today: "How was today?" asks for the thing the
 * feature is actually for, where "Add a note" would name a widget. On a past day it drops to the
 * plain form — the question would be asking about a day that has already been answered by
 * everything above it, and a diary that can only be written on the day itself is one you lose
 * every time you fall asleep first.
 */
export function noteRowContract({
  body,
  isToday,
  dayTitle,
}: {
  body: string;
  isToday: boolean;
  dayTitle: string;
}): NoteRowContract {
  const written = body.trim();
  if (written) {
    return {
      mode: 'read',
      text: written,
      label: `Note for ${dayTitle.toLowerCase()}`,
      hint: 'Opens it to read, add to, or edit.',
    };
  }
  return {
    mode: 'write',
    text: isToday ? 'How was today?' : `Add a note for ${dayTitle.toLowerCase()}`,
    label: isToday ? 'Write today’s note' : `Write a note for ${dayTitle.toLowerCase()}`,
    hint: 'Opens a field you can speak or type into.',
  };
}
