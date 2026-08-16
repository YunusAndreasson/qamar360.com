/**
 * Searching a diary by what it means, without breaking searching it by what it says.
 *
 * The Journal has always had one search: {@link matchesQuery}, a folded substring match over the
 * body, the rendered date title and the raw date. It is exact, instant, and it is the reason
 * "alhamdulillah" finds `Alḥamdulillāh`. **None of that changes here.**
 *
 * What this adds is a second, slower opinion — a similarity score against an on-device embedding of
 * each chunk — and the whole design is arranged so that opinion can only ever *add* rows. The
 * lexical filter still runs synchronously on the keystroke; semantic hits join a few hundred
 * milliseconds later, when the model has answered. The list never gets slower. It only gets longer.
 *
 * A test asserts that literally: with no semantic hits, {@link mergeSearchResults} returns exactly
 * `archive.filter((n) => matchesQuery(n, query, today))`. That is the additive promise made
 * mechanical rather than merely intended.
 *
 * ## The division of labour
 *
 * **Lexical owns orthography and dates. Semantic owns meaning.** The chunks are embedded raw and the
 * query is embedded raw — neither side is folded — because {@link foldText} exists to bridge
 * `duʿāʾ`↔"dua" for substring matching, and the model has never seen either spelling as a clean
 * token. Folding one side and not the other would guarantee a mismatch; folding both would hand the
 * model a string no tokeniser was trained on. The date is likewise left out of the embedded text: it
 * is already searched exactly, and injecting "Saturday, 15 August 2026" into every chunk would drag
 * the entire corpus toward a date-shaped centroid.
 *
 * Pure, and tested — no storage, no model, no React.
 */

import { decodeVector, similarity } from '@/lib/embedding-vector';
import { noteStamp } from '@/lib/note-chunks';
import { matchesQuery, type DailyNote } from '@/lib/notes';
import type { EmbedIndex } from '@/lib/notes-embed-cache';

/**
 * The floor a chunk must clear to be a result at all.
 *
 * This is the constant that makes "Nothing found" still mean something. `multi-qa-MiniLM-L6-cos-v1`
 * is trained with a cosine objective that pushes negatives toward zero, so on this kind of text
 * unrelated pairs sit around 0.0–0.15, topical-but-not-answering around 0.25–0.40, and a genuine
 * answer 0.40–0.70. Without a floor every query returns all 365 notes ranked by noise, and a search
 * that always finds something is a search that has told you nothing.
 *
 * 0.35 is a well-founded starting point, not a measured one. It is one number, in one pure module,
 * behind one test — which is where a value you expect to change three times belongs.
 */
export const MIN_SIMILARITY = 0.35;

/**
 * How far below the best hit a result may still appear.
 *
 * A query that genuinely matches one evening at 0.72 should not also drag in thirty notes at 0.36
 * that merely mention the weather. Relative, not absolute, because the absolute scale moves with how
 * unusual the query is.
 */
const SCORE_WINDOW = 0.15;

/** A hard ceiling, so a mis-tuned {@link MIN_SIMILARITY} is a disappointing search rather than a
 *  screen of everything the user has ever written. */
export const MAX_SEMANTIC_HITS = 20;

/** What the sweep should do next: notes whose vectors are missing or stale, and vectors for notes
 *  that no longer exist. */
export type EmbedWork = { queue: DailyNote[]; orphans: string[] };

/**
 * Decide what still needs embedding.
 *
 * **Newest first.** The note somebody is looking for is overwhelmingly a recent one, so a sweep
 * ordered this way is useful within its first second and cheap to interrupt — which it will be,
 * every time the user leaves the screen.
 *
 * A note whose stamp has changed is treated as *missing*, not as stale-but-usable. Serving the old
 * vector would mean someone who deleted a paragraph could still find the note by the words they
 * deleted, which is precisely the wrong failure for a diary. The gap is a few hundred milliseconds,
 * and the exact search covers it throughout.
 */
export function planEmbedWork(archive: readonly DailyNote[], index: EmbedIndex | null): EmbedWork {
  const stored = index?.notes ?? {};
  const queue: DailyNote[] = [];
  const live = new Set<string>();

  for (const note of archive) {
    live.add(note.note_date);
    const entry = stored[note.note_date];
    if (!entry || entry.stamp !== noteStamp(note.body)) queue.push(note);
  }

  queue.sort((a, b) => b.note_date.localeCompare(a.note_date));
  return { queue, orphans: Object.keys(stored).filter((date) => !live.has(date)) };
}

/**
 * Score every indexed note against one query vector.
 *
 * **A note scores as its best chunk, not its average.** A day is relevant if any part of it was
 * about the thing; mean-pooling would penalise a long entry for also containing breakfast, which is
 * exactly backwards for a diary — and it would make the paragraph-level chunking pointless.
 *
 * Returns only the notes that survive all three gates, so the caller can treat a present key as
 * "this is a result" without re-applying any threshold.
 */
export function rankSemantic(query: Float32Array, index: EmbedIndex | null): ReadonlyMap<string, number> {
  const hits = new Map<string, number>();
  if (!index) return hits;

  for (const [date, entry] of Object.entries(index.notes)) {
    let best = -Infinity;
    for (const encoded of entry.chunks) {
      const vector = decodeVector(encoded, index.dims);
      // A chunk that will not decode is skipped rather than scored as zero: zero is a real
      // similarity, and letting corruption vote is worse than letting it abstain.
      if (vector) best = Math.max(best, similarity(vector, query));
    }
    if (best >= MIN_SIMILARITY) hits.set(date, best);
  }

  const ranked = [...hits.entries()].sort((a, b) => b[1] - a[1]);
  const ceiling = ranked[0]?.[1] ?? 0;
  return new Map(ranked.filter(([, score]) => score >= ceiling - SCORE_WINDOW).slice(0, MAX_SEMANTIC_HITS));
}

/** The rows to show, and which of them nobody's words appear in. */
export type SearchResults = { notes: DailyNote[]; related: ReadonlySet<string> };

/**
 * Combine the two searches.
 *
 * **Order stays `note_date` descending — never by score.** This screen's whole identity is a
 * reverse-chronological list grouped by month, which is how people actually navigate a diary ("it
 * was around March"). Re-ranking by an opaque similarity number would destroy the month grouping and
 * replace a structure everyone understands with one nobody can predict.
 *
 * An empty query is not a search: it returns the whole archive and marks nothing, even if a stale
 * semantic result is still in hand.
 */
export function mergeSearchResults({
  archive,
  query,
  today,
  semantic,
}: {
  archive: readonly DailyNote[];
  query: string;
  today: string;
  semantic: ReadonlyMap<string, number>;
}): SearchResults {
  if (!query.trim()) return { notes: [...archive], related: EMPTY_RELATED };

  const related = new Set<string>();
  const notes = archive.filter((note) => {
    // Lexical first, and short-circuiting: a note containing the typed words is a plain result, and
    // must never be marked `related` just because it also scored well.
    if (matchesQuery(note, query, today)) return true;
    if (!semantic.has(note.note_date)) return false;
    related.add(note.note_date);
    return true;
  });

  return { notes, related };
}

/**
 * What the right-hand end of an archive row says.
 *
 * The slot already holds how long was spoken into the note. During a search it is worth more as an
 * explanation: a row containing none of the words you typed, offered with no reason, reads as a
 * broken search rather than a clever one. Lower-case, because it is a note about the row rather than
 * a label on it.
 */
export function archiveRowTrailing({
  query,
  isRelated,
  spokenLabel,
}: {
  query: string;
  isRelated: boolean;
  spokenLabel: string | null;
}): string | null {
  if (query.trim() && isRelated) return 'related';
  return spokenLabel;
}

/** Everything the Journal's empty state paints, resolved here so the screen holds no copy rules. */
export type JournalEmptyCopy = { icon: 'searchOff' | 'journal'; title: string; body: string };

/**
 * The empty state, which has to stop over-claiming once meaning is in play.
 *
 * "No note has those words in it" is exactly true of a substring search and quietly false of this
 * one — with semantic search on, the app has also looked for notes that *mean* it and come back
 * empty-handed. Saying so is the difference between a search you trust and one you learn to
 * second-guess.
 */
export function journalEmptyCopy({ query, semanticOn }: { query: string; semanticOn: boolean }): JournalEmptyCopy {
  if (!query.trim()) {
    return {
      icon: 'journal',
      title: 'Nothing written yet',
      body: 'Notes you write at the foot of the day collect here, oldest kept as long as you keep them.',
    };
  }
  return {
    icon: 'searchOff',
    title: 'Nothing found',
    body: semanticOn ? 'No note says that, or means it.' : 'No note has those words in it.',
  };
}

/** Frozen and shared, so an inactive search hands React the same reference on every render rather
 *  than a fresh empty set that invalidates every memo downstream. */
const EMPTY_RELATED: ReadonlySet<string> = new Set<string>();
