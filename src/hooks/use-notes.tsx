import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useHabits } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import { todayLocalISO } from '@/lib/dates';
import { buildVocabulary, type Vocabulary } from '@/lib/note-vocabulary';
import type { DailyNote } from '@/lib/notes';
import { clearNoteDraft, readNotesSnapshot, writeNotesSnapshot } from '@/lib/notes-cache';
import { supabase } from '@/lib/supabase';

/**
 * The day's note, and the archive of every note before it.
 *
 * Its own provider and its own table for the same reason `TasksProvider` has both: a note earns no
 * degrees, so nothing about it reaches the progress math. Mounted *inside* `HabitsProvider`, which
 * owns the day — `viewDate`, `today`, the midnight rollover — and also owns the habits and stacks
 * this reads to build the dictation vocabulary.
 *
 * The write path is deliberately smaller than the tasks one. There is at most a single row per day,
 * with no ordering, no completion and no carry-forward — so there is nothing here like the habits
 * provider's mutation-generation machinery. Two races are guarded, and only two: the view stepping
 * to another day while a request is in flight, and this client believing a day is empty when
 * another device has already written it (see {@link saveNote}).
 */

const LOAD_ERROR = 'Could not load your notes. Check your connection and try again.';
const SAVE_ERROR = 'Could not save your note. Check your connection.';
/** The day already had a note — written on another device, or in another session. Nothing was
 *  overwritten; the editor stays open with the words still in it, and closing it shows what is
 *  actually on the server. */
const CONFLICT_ERROR = 'That day already has a note. Close this to see it — nothing was overwritten.';
const DELETE_ERROR = 'Could not delete that note. Check your connection.';

/** Trailing delay before persisting the cold-start snapshot — the habits provider's rationale. */
const SNAPSHOT_DEBOUNCE_MS = 400;

type NotesContextValue = {
  /** The viewed day's note, or null if it has none. */
  note: DailyNote | null;
  /**
   * True while this day's note is still unknown — a cold start with no snapshot, or the moment
   * after a day-step. Distinct from `note === null`, which is the settled answer "this day has
   * none", and the foot of the day has to tell those apart: stepping back to a day you *did* write
   * about would otherwise flash "Add a note for Tuesday" before the entry arrived.
   */
  noteLoading: boolean;
  /** Every note, newest first — the Journal. Empty until {@link loadArchive} has run. */
  archive: DailyNote[];
  archiveLoading: boolean;
  error: string | null;
  dismissError: () => void;
  /**
   * The spellings a spoken note is corrected against: the curated Sunnah terms plus the
   * distinctive words from this user's own habits and stacks. Compiled here because this is the
   * one place that can see both, and rebuilt only when those names actually change.
   */
  vocabulary: Vocabulary;
  /**
   * The note for any day — the viewed one from the day-scoped fetch, any other from the archive.
   *
   * The editor is reached from two places with two different ideas of "which day": the foot of
   * Today (the viewed day) and the Journal (a day that may be years old and far outside the
   * stepper's thirty-day reach). One lookup for both, so neither has to special-case the other.
   */
  noteFor: (day: string) => DailyNote | null;
  /**
   * Write a day's note, defaulting to the viewed one. An empty body deletes the row rather than
   * storing a blank one.
   *
   * Returns whether it landed, because the editor has to know: it is a modal, and a modal that
   * dismisses on a failed write takes the only surface the error could have appeared on with it —
   * and takes the words with it too, as far as the user can see.
   */
  saveNote: (body: string, spokenSeconds: number | null, day?: string) => Promise<boolean>;
  /**
   * Throw a day's note away. Returns whether the row is actually gone — the editor closes on that,
   * and stays open with its banner otherwise.
   *
   * Emptying the field and saving does the same thing, and did so from the first day; what it never
   * did was tell anybody, so this is the same act with a name on it.
   */
  deleteNote: (day: string) => Promise<boolean>;
  /** Pull the whole archive. Called by the Journal screen when it opens. */
  loadArchive: () => Promise<void>;
  refresh: () => Promise<boolean>;
};

const NotesContext = createContext<NotesContextValue | null>(null);

export function useNotes(): NotesContextValue {
  const value = useContext(NotesContext);
  if (!value) throw new Error('useNotes must be used within a NotesProvider');
  return value;
}

export function NotesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { viewDate, habits, stacks } = useHabits();

  // Seed from the last-known snapshot so the foot of the day paints on the first frame instead of
  // arriving a beat later and pushing the sky down. Trusted only while its day is still today.
  const [snapshot] = useState(readNotesSnapshot);
  const seed = snapshot && snapshot.userId === userId && snapshot.day === todayLocalISO() ? snapshot : null;

  /**
   * The note *and the day it belongs to*, held together.
   *
   * One state rather than two, because the pair is what has to stay consistent: on a day-step the
   * screen must stop showing the old day's note in the same commit the day changes, and every
   * version of that written as "blank it, then fetch" is a second render where a note is on screen
   * under the wrong date. Here it can't happen — {@link note} is derived, and a fetched note is
   * simply invisible until the day matches it.
   */
  const [loaded, setLoaded] = useState<{ day: string; note: DailyNote | null } | null>(() =>
    seed ? { day: seed.day, note: seed.note } : null,
  );
  const known = loaded?.day === viewDate;
  const note = known ? (loaded?.note ?? null) : null;
  const [loading, setLoading] = useState(() => !seed);
  const [archive, setArchive] = useState<DailyNote[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const viewDateRef = useLatestRef(viewDate);
  // The user this provider currently serves. A fetch that lands after a sign-in as somebody else
  // must not write its rows onto the new one's screen — `use-progress` guards the same way.
  const userRef = useLatestRef(userId);
  // Days this session has deleted a note on. A delete removes the row optimistically, the editor
  // closes on that state, Today regains focus and refreshes — and that SELECT can reach the server
  // before the DELETE does, handing the note straight back. Filtering the fetch is what makes the
  // delete stick whichever round-trip wins; the day is dropped again only if the delete fails.
  const deletedDays = useRef<Set<string>>(new Set());
  const archiveInFlight = useRef<Promise<void> | null>(null);

  const fetchNote = useCallback(
    async (day: string) => {
      if (!userId) return true;
      const { data, error: fetchError } = await supabase
        .from('daily_notes')
        .select('*')
        .eq('user_id', userId)
        .eq('note_date', day)
        .maybeSingle();
      // Superseded mid-flight, two ways: the view stepped to another day (the guard every
      // day-scoped path in `use-habits` uses), or the session became somebody else's.
      if (userRef.current !== userId || viewDateRef.current !== day) return true;
      if (fetchError) {
        setError(LOAD_ERROR);
        return false;
      }
      setLoaded({ day, note: deletedDays.current.has(day) ? null : data });
      // Cleared on the way through rather than only by the banner's own dismiss: a load that
      // succeeded has answered whatever the last one failed at. It is also what releases the
      // snapshot effect below, which refuses to write for as long as an error stands.
      setError(null);
      return true;
    },
    [userId, userRef, viewDateRef],
  );

  const refresh = useCallback(() => fetchNote(viewDateRef.current), [fetchNote, viewDateRef]);

  // First load, and every day-step or midnight rollover after it. Nothing is blanked here: the
  // day-stamped pair above means the previous day's note stops being visible the instant `viewDate`
  // changes, without a second render to do it in.
  useEffect(() => {
    let active = true;
    void (async () => {
      await fetchNote(viewDate);
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchNote, viewDate]);

  // Persist the day's note for the next cold start (trailing, so a burst of saves writes once).
  useEffect(() => {
    if (loading || !userId || error) return;
    const timer = setTimeout(() => writeNotesSnapshot({ userId, day: viewDate, note }), SNAPSHOT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [loading, userId, error, viewDate, note]);

  /**
   * The whole archive, deduped against itself. The Journal has two callers — a focus refetch and
   * pull-to-refresh — and a pull begun while the focus fetch is still out would otherwise issue a
   * second identical SELECT that can only return the same rows.
   */
  const loadArchive = useCallback(async () => {
    if (!userId) {
      // Nothing to fetch and nothing to wait for. Returning with `archiveLoading` still true would
      // sit the Journal on its skeletons for as long as the app is open.
      setArchiveLoading(false);
      return;
    }
    if (archiveInFlight.current) return archiveInFlight.current;
    const run = (async () => {
      const { data, error: fetchError } = await supabase
        .from('daily_notes')
        .select('*')
        .eq('user_id', userId)
        .order('note_date', { ascending: false });
      if (fetchError) setError(LOAD_ERROR);
      else {
        setArchive((data ?? []).filter((n) => !deletedDays.current.has(n.note_date)));
        setError(null); // as in `fetchNote` — a good read retracts the last bad one
      }
      setArchiveLoading(false);
    })();
    archiveInFlight.current = run;
    try {
      await run;
    } finally {
      archiveInFlight.current = null;
    }
  }, [userId]);

  const dismissError = useCallback(() => setError(null), []);

  const deleteNoteRow = useCallback(
    async (noteId: string, day: string) => {
      const removed = archive.find((n) => n.id === noteId) ?? (note?.id === noteId ? note : null);
      deletedDays.current.add(day);
      setLoaded({ day, note: null });
      setArchive((prev) => prev.filter((n) => n.id !== noteId));

      if (noteId.startsWith('temp-')) return true; // never persisted
      const { error: delError } = await supabase.from('daily_notes').delete().eq('id', noteId);
      if (delError) {
        deletedDays.current.delete(day);
        if (removed) {
          setLoaded({ day, note: removed });
          setArchive((prev) => [removed, ...prev].sort((a, b) => b.note_date.localeCompare(a.note_date)));
        }
        setError(DELETE_ERROR);
        return false;
      }
      setError(null);
      return true;
    },
    [archive, note],
  );

  /**
   * Write a day's note.
   *
   * An emptied body **deletes** the row. A day with a blank note and a day with no note are the
   * same day, and storing the difference would put an empty entry in the archive that the user
   * cannot see the point of and cannot get rid of by clearing the field.
   *
   * **Update when we know of a row, insert when we don't — never a blind upsert.** The distinction
   * matters exactly once, and the once is bad enough to be worth the branch: if this client thinks
   * the day is empty but the server has an entry written on another device, an upsert would replace
   * somebody's diary with a blank slate they never saw. An insert instead comes back as a unique
   * violation on `(user_id, note_date)`, and the recovery is to write nothing, say so, and leave the
   * text sitting in the editor where it still is.
   *
   * Every exit returns whether the words reached the server, because the editor closes on `true`
   * and stays open on `false`. Nothing here dismisses anything itself.
   */
  const saveNote = useCallback(
    async (body: string, spokenSeconds: number | null, forDay?: string): Promise<boolean> => {
      // Unreachable behind the auth gate, and returning `false` is the safe reading anyway: no
      // session, no write, so nothing should behave as though there had been one.
      if (!userId) return false;
      const day = forDay ?? viewDateRef.current;
      const clean = body.trim();
      const existing = day === viewDateRef.current ? note : (archive.find((n) => n.note_date === day) ?? null);

      if (!clean) {
        if (existing && !(await deleteNoteRow(existing.id, day))) return false;
        clearNoteDraft();
        return true;
      }

      // Optimistic, against a temp row when there was nothing here — so the foot of the day shows
      // what was just written before the round-trip, exactly as a ticked task does.
      const optimistic: DailyNote = existing
        ? { ...existing, body: clean, spoken_seconds: spokenSeconds }
        : {
            id: `temp-${day}`,
            user_id: userId,
            note_date: day,
            body: clean,
            spoken_seconds: spokenSeconds,
            created_at: null,
            updated_at: null,
          };
      deletedDays.current.delete(day);
      // Stamped with the day it is for. Saving an old note from the Journal therefore updates the
      // archive without ever touching the foot of today, which is the one place the user is looking.
      setLoaded({ day, note: optimistic });
      setArchive((prev) =>
        [optimistic, ...prev.filter((n) => n.note_date !== day)].sort((a, b) =>
          b.note_date.localeCompare(a.note_date),
        ),
      );

      const fields = { body: clean, spoken_seconds: spokenSeconds, updated_at: new Date().toISOString() };
      const { data, error: saveError } =
        existing && !existing.id.startsWith('temp-')
          ? await supabase.from('daily_notes').update(fields).eq('id', existing.id).select().single()
          : await supabase
              .from('daily_notes')
              .insert({ user_id: userId, note_date: day, ...fields })
              .select()
              .single();

      if (saveError || !data) {
        setArchive((prev) =>
          existing ? prev.map((n) => (n.note_date === day ? existing : n)) : prev.filter((n) => n.note_date !== day),
        );
        // 23505 — the day already has a note this client had never seen. Put the screen back to
        // whatever is actually on the server rather than to our own stale idea of it, and say what
        // happened. The user's words are untouched, still in the editor they were typed into.
        if (saveError?.code === '23505') {
          // Re-read whichever surface is showing this day. `fetchNote` is day-scoped and returns
          // early for anything but the viewed day, so a note saved from the Journal has to refresh
          // the archive instead — otherwise the recovery would silently refresh nothing. Both of
          // them clear the error on success, so the conflict is set *after* the re-read rather
          // than before it, or the message would be wiped by its own recovery.
          await (day === viewDateRef.current ? fetchNote(day) : loadArchive());
          setError(CONFLICT_ERROR);
          return false;
        }
        setLoaded({ day, note: existing });
        setError(SAVE_ERROR);
        return false;
      }
      // Kept until the server has it, and not a moment before: the draft is the only copy of a
      // sentence between the recogniser returning it and this row existing.
      clearNoteDraft();
      setLoaded({ day, note: data });
      setArchive((prev) => prev.map((n) => (n.note_date === day ? data : n)));
      setError(null);
      return true;
    },
    [userId, note, archive, deleteNoteRow, fetchNote, loadArchive, viewDateRef],
  );

  const noteFor = useCallback(
    (day: string) => (day === viewDate ? note : (archive.find((n) => n.note_date === day) ?? null)),
    [viewDate, note, archive],
  );

  const deleteNote = useCallback(
    async (day: string) => {
      const existing = noteFor(day);
      // Already nothing there — a day with no note and a day whose note was just deleted are the
      // same day, so this is done rather than failed.
      if (!existing) return true;
      const gone = await deleteNoteRow(existing.id, day);
      // The interrupted sitting went with the entry it belonged to; leaving it would offer to
      // restore the very words that were just thrown away.
      if (gone) clearNoteDraft();
      return gone;
    },
    [noteFor, deleteNoteRow],
  );

  // The user's own words, harvested once per change of their habits and stacks rather than per
  // render — `buildVocabulary` walks every name and folds every term.
  const names = useMemo(
    () => [...habits.map((h) => h.name), ...stacks.map((s) => s.name)],
    [habits, stacks],
  );
  const vocabulary = useMemo(() => buildVocabulary(names), [names]);

  const value = useMemo(
    () => ({
      note,
      noteLoading: !known,
      archive,
      archiveLoading,
      error,
      dismissError,
      vocabulary,
      noteFor,
      saveNote,
      deleteNote,
      loadArchive,
      refresh,
    }),
    [
      note,
      known,
      archive,
      archiveLoading,
      error,
      dismissError,
      vocabulary,
      noteFor,
      saveNote,
      deleteNote,
      loadArchive,
      refresh,
    ],
  );

  return <NotesContext value={value}>{children}</NotesContext>;
}
