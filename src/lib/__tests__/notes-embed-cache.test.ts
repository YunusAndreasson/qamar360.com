import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { EmbedIndex, EmbedIndexHeader } from '@/lib/notes-embed-cache';

/** The module's surface, spelled out because it is reached through `require` (below) and so has no
 *  inferred type of its own. Type-only imports are erased, so naming it here loads nothing. */
type EmbedCache = {
  readEmbedIndex: (expect: EmbedIndexHeader) => EmbedIndex | null;
  writeEmbedIndex: (index: EmbedIndex) => void;
  clearEmbedIndex: () => void;
};

// Same reasoning as `notes-cache.test.ts`: the module opens with the SQLite `localStorage` shim,
// which under Jest reaches for a native module that isn't there.
jest.mock('expo-sqlite/localStorage/install', () => ({}));

const store = new Map<string, string>();
let setThrows = false;
let removeThrows = false;

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
  readEmbedIndex,
  writeEmbedIndex,
  clearEmbedIndex,
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the fake storage
} = require('@/lib/notes-embed-cache') as EmbedCache;

const INDEX_KEY = 'notes.embeddings.v1';

const HEADER: EmbedIndexHeader = {
  userId: 'u1',
  model: 'multi-qa-MiniLM-L6-cos-v1',
  dims: 384,
  chunker: 1,
};

const INDEX: EmbedIndex = { ...HEADER, notes: { '2026-08-16': { stamp: 'a.b', chunks: ['AAAA'] } } };

beforeEach(() => {
  store.clear();
  setThrows = false;
  removeThrows = false;
});

describe('round trip', () => {
  it('reads back what it wrote', () => {
    writeEmbedIndex(INDEX);
    expect(readEmbedIndex(HEADER)).toEqual(INDEX);
  });

  it('returns null for an empty slot', () => {
    expect(readEmbedIndex(HEADER)).toBeNull();
  });

  it('clears the key', () => {
    // Turning the feature off has to actually reclaim the storage it cost, not merely stop using it.
    writeEmbedIndex(INDEX);
    clearEmbedIndex();
    expect(store.has(INDEX_KEY)).toBe(false);
    expect(readEmbedIndex(HEADER)).toBeNull();
  });
});

describe('the header is the invalidation mechanism', () => {
  // Each of these is a real way the stored vectors stop describing the notes they were made from,
  // and none of them is visible to a content stamp.
  it.each([
    ['another account', { userId: 'u2' }],
    ['another model', { model: 'all-MiniLM-L6-v2' }],
    ['another vector width', { dims: 768 }],
    ['different chunking rules', { chunker: 2 }],
  ])('discards an index written under %s', (_label, difference) => {
    writeEmbedIndex(INDEX);
    expect(readEmbedIndex({ ...HEADER, ...difference })).toBeNull();
  });

  it('does not leak one account’s vectors into another’s search', () => {
    // A shared phone is an ordinary thing, and a diary is the wrong place to be casual about it.
    writeEmbedIndex(INDEX);
    expect(readEmbedIndex({ ...HEADER, userId: 'someone-else' })).toBeNull();
  });
});

describe('a bad blob degrades the feature, never the screen', () => {
  it('returns null for unparseable JSON', () => {
    store.set(INDEX_KEY, '{not json');
    expect(readEmbedIndex(HEADER)).toBeNull();
  });

  it('returns null for JSON that is not an object', () => {
    store.set(INDEX_KEY, '"a string"');
    expect(readEmbedIndex(HEADER)).toBeNull();
  });

  it('returns null for null', () => {
    store.set(INDEX_KEY, 'null');
    expect(readEmbedIndex(HEADER)).toBeNull();
  });

  it('returns null when the header reads clean but `notes` is malformed', () => {
    // The one field a half-written blob can leave wrong while everything else still validates.
    store.set(INDEX_KEY, JSON.stringify({ ...HEADER, notes: 'not an object' }));
    expect(readEmbedIndex(HEADER)).toBeNull();
  });

  it('returns null when `notes` is missing entirely', () => {
    store.set(INDEX_KEY, JSON.stringify(HEADER));
    expect(readEmbedIndex(HEADER)).toBeNull();
  });
});

describe('storage failures are swallowed', () => {
  it('does not throw when the store is full', () => {
    // The sweep's work is lost and redone next time the Journal opens. Slow, never wrong.
    setThrows = true;
    expect(() => writeEmbedIndex(INDEX)).not.toThrow();
  });

  it('does not throw when the key cannot be removed', () => {
    removeThrows = true;
    expect(() => clearEmbedIndex()).not.toThrow();
  });
});
