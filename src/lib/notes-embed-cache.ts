import 'expo-sqlite/localStorage/install';

import { getWebStorage } from '@/lib/web-storage';

/**
 * Where the Journal's semantic index lives between launches.
 *
 * One blob, not one key per note. The storage seam this app uses ({@link getWebStorage}) declares
 * `getItem`/`setItem`/`removeItem` and nothing else — there is no way to enumerate keys — so
 * per-note keys would need a second key holding an index of the first, and would cost one
 * synchronous SQLite read per note to load a year of them. One blob is also what
 * `habits-cache.ts` and `use-catalog.tsx` already do.
 *
 * ## Keyed by date, never by id
 *
 * `daily_notes` is unique on `(user_id, note_date)`, and `note_date` is the half of that which
 * survives everything: an optimistic row carries `id: 'temp-2026-08-16'` until the server answers
 * and then becomes a UUID, and a note deleted and rewritten on the same day gets a new id for the
 * same day. The date is the note's identity here; the id is an implementation detail of one write.
 *
 * ## Never read at startup
 *
 * Nothing calls in here until the Journal is on screen with the feature switched on. That is what
 * keeps the promise made in `preferences.ts` literal — an install that never opens Settings does not
 * read this key, does not parse it, and does not pay for it.
 *
 * Dumb on purpose: this file validates the header and moves strings. Every decision about *what* to
 * embed and *when* lives in `lib/note-search.ts`, where it can be tested without a storage shim.
 */

/**
 * Bump for an **encoding** change — a different base64 flavour, a different quantisation.
 *
 * Model, dimension and chunker changes do not come through here; they are caught by the header
 * check in {@link readEmbedIndex}, which is finer-grained and needs no code change to trip. Per this
 * repo's convention there is no migration either way: a bump orphans the old blob and the sweep
 * rebuilds from notes that are all still on the server.
 */
const INDEX_KEY = 'notes.embeddings.v1';

const storage = getWebStorage();

/** One note's vectors: the stamp of the body they were made from, and one base64 chunk each. */
type EmbedEntry = { stamp: string; chunks: string[] };

/**
 * The whole index.
 *
 * The header is not decoration — it is the invalidation mechanism for everything a content stamp
 * cannot see. `userId` matters most: one account must never rank its search against another's
 * vectors, and a shared phone is an ordinary thing.
 */
export type EmbedIndex = {
  userId: string;
  /** The model that produced these. Different model, different vector space, meaningless scores. */
  model: string;
  /** Its output width. Guards a model that kept its name and changed its shape. */
  dims: number;
  /** Bumped by hand when the chunking rules in `note-chunks.ts` change, since the same body then
   *  yields different pieces and the stored vectors describe text that is no longer produced. */
  chunker: number;
  notes: Record<string, EmbedEntry>;
};

/** What the caller believes it is about to read. Anything else on disk is discarded. */
export type EmbedIndexHeader = Pick<EmbedIndex, 'userId' | 'model' | 'dims' | 'chunker'>;

/**
 * The stored index, or `null` — for an empty slot, a corrupt one, or one written under a different
 * model, account, dimension or chunker.
 *
 * Never throws. A bad blob degrades the Journal to the exact-substring search it has always had.
 */
export function readEmbedIndex(expect: EmbedIndexHeader): EmbedIndex | null {
  try {
    const raw = storage?.getItem(INDEX_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<EmbedIndex> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (
      parsed.userId !== expect.userId ||
      parsed.model !== expect.model ||
      parsed.dims !== expect.dims ||
      parsed.chunker !== expect.chunker
    ) {
      return null;
    }
    // `notes` is the one field a hand-edited or half-written blob can leave malformed while the
    // header still reads clean, so it is checked rather than trusted.
    if (!parsed.notes || typeof parsed.notes !== 'object') return null;

    return { ...expect, notes: parsed.notes };
  } catch {
    return null;
  }
}

export function writeEmbedIndex(index: EmbedIndex): void {
  try {
    storage?.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // Best-effort, exactly as the other caches are. A quota failure means the sweep's work is lost
    // and will be redone next time the Journal is opened — slow, never wrong.
  }
}

/** Drop the index entirely. Used when the feature is switched off, so turning it off actually
 *  reclaims what it cost rather than leaving a quarter-megabyte nobody can see. */
export function clearEmbedIndex(): void {
  try {
    storage?.removeItem(INDEX_KEY);
  } catch {
    // Nothing to recover to; the next successful write replaces it wholesale anyway.
  }
}
