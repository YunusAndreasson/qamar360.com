import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { DailyNote } from '@/lib/notes';
import type { NoteDraft, NotesSnapshot } from '@/lib/notes-cache';

/** The module's surface, spelled out because it is reached through `require` (below) and so has no
 *  inferred type of its own. Type-only imports are erased, so naming it here loads nothing. */
type NotesCache = {
  readNoteDraft: () => NoteDraft | null;
  writeNoteDraft: (draft: NoteDraft) => void;
  clearNoteDraft: () => void;
  readNotesSnapshot: () => NotesSnapshot | null;
  writeNotesSnapshot: (snapshot: NotesSnapshot) => void;
};

// `notes-cache` opens with `import 'expo-sqlite/localStorage/install'`, whose whole job is to put a
// SQLite-backed `localStorage` on the global — and under Jest that reaches for a native module that
// isn't there. Stubbed to nothing so the fake below is what the module finds.
jest.mock('expo-sqlite/localStorage/install', () => ({}));

// The app persists through that shim; under Jest there is none, so stand an in-memory one up.
// Unlike `preferences`, this module resolves `localStorage` **once, at load**, so the fake has to be
// installed before the import — hence the `require` below rather than a static one at the top.
const store = new Map<string, string>();
let removeThrows = false;
let setThrows = false;

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (setThrows) throw new Error('quota');
      store.set(key, value);
    },
    removeItem: (key: string) => {
      if (removeThrows) throw new Error('unavailable');
      store.delete(key);
    },
  },
});

const {
  readNoteDraft,
  writeNoteDraft,
  clearNoteDraft,
  readNotesSnapshot,
  writeNotesSnapshot,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the fake storage
} = require('@/lib/notes-cache') as NotesCache;

const SNAPSHOT_KEY = 'notes.snapshot.v1';
const DRAFT_KEY = 'notes.draft.v1';

function note(overrides: Partial<DailyNote> = {}): DailyNote {
  return {
    id: 'n1',
    user_id: 'u1',
    note_date: '2026-08-15',
    body: 'The day went quietly.',
    spoken_seconds: 40,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  store.clear();
  removeThrows = false;
  setThrows = false;
});

describe('the draft — the only copy of a spoken sentence until the note is saved', () => {
  it('round-trips what is being written', () => {
    writeNoteDraft({ userId: 'u1', day: '2026-08-15', body: 'I prayed Fajr on time.' });
    expect(readNoteDraft()).toEqual({ userId: 'u1', day: '2026-08-15', body: 'I prayed Fajr on time.' });
  });

  it('is nothing at all until something has been written', () => {
    expect(readNoteDraft()).toBeNull();
  });

  it('is gone after clearing, not blanked', () => {
    // An empty string left in the slot would read at launch as an interrupted sitting holding
    // nothing, which is a different and worse answer than "there is no draft".
    writeNoteDraft({ userId: 'u1', day: '2026-08-15', body: 'something' });
    clearNoteDraft();
    expect(store.has(DRAFT_KEY)).toBe(false);
    expect(readNoteDraft()).toBeNull();
  });

  it('keeps its own slot, so a snapshot write can never land on a draft', () => {
    // Two writers on two clocks: one runs after every sentence, the other 400 ms after a save.
    // Sharing a key would eventually persist a half-formed copy of the other's state.
    writeNoteDraft({ userId: 'u1', day: '2026-08-15', body: 'mid-sentence' });
    writeNotesSnapshot({ userId: 'u1', day: '2026-08-15', note: note() });
    expect(readNoteDraft()?.body).toBe('mid-sentence');
    expect(readNotesSnapshot()?.note?.body).toBe('The day went quietly.');
  });
});

describe('the snapshot — the foot of the day, painted on the first frame', () => {
  it('round-trips a day that has a note', () => {
    writeNotesSnapshot({ userId: 'u1', day: '2026-08-15', note: note() });
    const read = readNotesSnapshot();
    expect(read?.userId).toBe('u1');
    expect(read?.day).toBe('2026-08-15');
    expect(read?.note?.body).toBe('The day went quietly.');
  });

  it('remembers a day with NO note, which is worth caching too', () => {
    // Otherwise a day nobody wrote about flashes the invitation row in and out on every cold start,
    // which is the exact flicker the snapshot exists to prevent.
    writeNotesSnapshot({ userId: 'u1', day: '2026-08-15', note: null });
    expect(readNotesSnapshot()).toEqual({ userId: 'u1', day: '2026-08-15', note: null });
  });

  it('carries the user and the day it was taken for, so the caller can refuse a stale one', () => {
    // The cache does not judge; it reports. Deciding a snapshot belongs to this session is the
    // provider's job, and it can only do it if these two fields survive the round trip.
    writeNotesSnapshot({ userId: 'u2', day: '2026-01-01', note: note({ user_id: 'u2' }) });
    expect(readNotesSnapshot()?.userId).toBe('u2');
    expect(readNotesSnapshot()?.day).toBe('2026-01-01');
  });
});

describe('a cache that fails is still a cache', () => {
  it('reads a corrupt slot as empty rather than throwing', () => {
    // A half-written value, or a schema from an older build. Either way the caller starts empty,
    // which is exactly what it would have done before anything was ever stored.
    store.set(DRAFT_KEY, '{not json');
    store.set(SNAPSHOT_KEY, '{"userId":');
    expect(readNoteDraft()).toBeNull();
    expect(readNotesSnapshot()).toBeNull();
  });

  it('swallows a failed write — a full disk must not take the note down with it', () => {
    setThrows = true;
    expect(() => writeNoteDraft({ userId: 'u1', day: '2026-08-15', body: 'x' })).not.toThrow();
    expect(() => writeNotesSnapshot({ userId: 'u1', day: '2026-08-15', note: null })).not.toThrow();
  });

  it('swallows a failed clear — the next save recovers from it', () => {
    writeNoteDraft({ userId: 'u1', day: '2026-08-15', body: 'x' });
    removeThrows = true;
    expect(() => clearNoteDraft()).not.toThrow();
  });
});
