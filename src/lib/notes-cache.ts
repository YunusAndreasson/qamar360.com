import 'expo-sqlite/localStorage/install';

import type { DailyNote } from '@/lib/notes';
import { getWebStorage } from '@/lib/web-storage';

/**
 * Two local records, on two different clocks — which is why they are two keys and not one, for the
 * same reason the tasks snapshot is not folded into the habits one: a writer that runs every few
 * seconds and a writer that runs after a save will eventually persist a half-formed copy of the
 * other's state if they share a slot.
 *
 * 1. {@link readNotesSnapshot} — the last-known note for the day, so a cold start paints the foot
 *    of Today on the first frame instead of popping it in a beat later.
 * 2. {@link readNoteDraft} — what is being said *right now*.
 */

const SNAPSHOT_KEY = 'notes.snapshot.v1';
const DRAFT_KEY = 'notes.draft.v1';

const storage = getWebStorage();

function read<T>(key: string): T | null {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null; // corrupt/unavailable cache — the caller simply starts empty
  }
}

function write(key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Best-effort cache; ignore quota/serialisation failures.
  }
}

/** The viewed day's note as last seen. `note` is null for a day that has none — which is itself
 *  worth caching, so a dayless day doesn't flash an invite row in and out on every cold start. */
export type NotesSnapshot = { userId: string; day: string; note: DailyNote | null };

export function readNotesSnapshot(): NotesSnapshot | null {
  return read<NotesSnapshot>(SNAPSHOT_KEY);
}

export function writeNotesSnapshot(snapshot: NotesSnapshot): void {
  write(SNAPSHOT_KEY, snapshot);
}

/**
 * What is being written, before it has been saved.
 *
 * This is the whole of the "never lose it" promise, and it is worth being precise about what that
 * promise is. The audio is never written to disk — it is transcribed from memory a sentence at a
 * time and dropped, which is the strongest form the privacy claim can take and also the reason
 * there is nothing to recover a lost recording *from*. So the recovery is the text instead: every
 * sentence the recogniser returns is appended here immediately, before anything else happens with
 * it. Kill the app mid-sentence and you lose that sentence. Nothing before it.
 *
 * Cleared the moment the note is saved to the server, so a draft found at launch always means an
 * interrupted sitting and never a stale copy of something already stored.
 */
export type NoteDraft = { userId: string; day: string; body: string };

export function readNoteDraft(): NoteDraft | null {
  return read<NoteDraft>(DRAFT_KEY);
}

export function writeNoteDraft(draft: NoteDraft): void {
  write(DRAFT_KEY, draft);
}

export function clearNoteDraft(): void {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {
    // As above — a draft that outlives its save is recovered from by the next save, not by a throw.
  }
}
