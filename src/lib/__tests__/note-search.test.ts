import { describe, expect, it } from '@jest/globals';

import { encodeVector } from '@/lib/embedding-vector';
import { noteStamp } from '@/lib/note-chunks';
import {
  MAX_SEMANTIC_HITS,
  MIN_SIMILARITY,
  archiveRowTrailing,
  journalEmptyCopy,
  mergeSearchResults,
  planEmbedWork,
  rankSemantic,
} from '@/lib/note-search';
import { matchesQuery, type DailyNote } from '@/lib/notes';
import type { EmbedIndex } from '@/lib/notes-embed-cache';

const TODAY = '2026-08-16';

function note(date: string, body: string, overrides: Partial<DailyNote> = {}): DailyNote {
  return {
    id: `id-${date}`,
    user_id: 'u1',
    note_date: date,
    body,
    spoken_seconds: null,
    created_at: null,
    updated_at: '2026-08-16T10:00:00Z',
    ...overrides,
  };
}

/** Three dimensions is enough to build exact similarities and keeps the base64 to four characters. */
const DIMS = 3;

/** A unit vector whose dot product with {@link QUERY} is exactly `score`. */
function vectorScoring(score: number): Float32Array {
  const v = new Float32Array(DIMS);
  v[0] = score;
  v[1] = Math.sqrt(Math.max(0, 1 - score * score));
  return v;
}

const QUERY = vectorScoring(1);

function index(notes: Record<string, { stamp?: string; scores: number[] }>): EmbedIndex {
  return {
    userId: 'u1',
    model: 'multi-qa-MiniLM-L6-cos-v1',
    dims: DIMS,
    chunker: 1,
    notes: Object.fromEntries(
      Object.entries(notes).map(([date, { stamp = 'x', scores }]) => [
        date,
        { stamp, chunks: scores.map((s) => encodeVector(vectorScoring(s))) },
      ]),
    ),
  };
}

describe('planEmbedWork', () => {
  it('queues a note with no stored vectors', () => {
    const archive = [note('2026-08-16', 'A quiet day.')];
    expect(planEmbedWork(archive, null).queue).toEqual(archive);
  });

  it('leaves an unchanged note alone', () => {
    const n = note('2026-08-16', 'A quiet day.');
    const work = planEmbedWork([n], index({ '2026-08-16': { stamp: noteStamp(n.body), scores: [0.9] } }));
    expect(work.queue).toEqual([]);
  });

  it('re-queues a note whose body changed', () => {
    const n = note('2026-08-16', 'A quiet day, and a long one.');
    const work = planEmbedWork([n], index({ '2026-08-16': { stamp: noteStamp('A quiet day.'), scores: [0.9] } }));
    expect(work.queue).toEqual([n]);
  });

  it('reports vectors for a note that no longer exists as orphans', () => {
    const work = planEmbedWork([], index({ '2026-03-01': { scores: [0.9] } }));
    expect(work.orphans).toEqual(['2026-03-01']);
  });

  it('treats an optimistic row like any other, and does not re-embed it when it is confirmed', () => {
    // This is the whole reason the stamp is a body hash rather than `updated_at`: that column is
    // null here and becomes a timestamp on confirm, so keying on it would re-embed on every save.
    const body = 'Wrote this just now.';
    const optimistic = note('2026-08-16', body, { id: 'temp-2026-08-16', updated_at: null });
    expect(planEmbedWork([optimistic], null).queue).toEqual([optimistic]);

    const stored = index({ '2026-08-16': { stamp: noteStamp(body), scores: [0.9] } });
    expect(planEmbedWork([optimistic], stored).queue).toEqual([]);

    const confirmed = note('2026-08-16', body, { id: 'uuid-real', updated_at: '2026-08-16T22:10:00Z' });
    expect(planEmbedWork([confirmed], stored).queue).toEqual([]);
  });

  it('orders the queue newest-first even when the archive is not', () => {
    // `saveNote` prepends an optimistic row, so the array it hands over can start out of order.
    const archive = [note('2026-01-02', 'Old.'), note('2026-08-16', 'New.'), note('2026-05-05', 'Middle.')];
    expect(planEmbedWork(archive, null).queue.map((n) => n.note_date)).toEqual([
      '2026-08-16',
      '2026-05-05',
      '2026-01-02',
    ]);
  });
});

describe('rankSemantic', () => {
  it('scores a note by its best chunk, never its mean', () => {
    // A day is relevant if any part of it was about the thing. A mean would punish a long entry for
    // also containing breakfast, and would make paragraph-level chunking pointless.
    //
    // These chunks are chosen so the two rules disagree loudly: the mean is 0.33, which is under
    // MIN_SIMILARITY, so a mean-pooling implementation would drop this note from the results
    // altogether rather than merely score it lower.
    const hits = rankSemantic(QUERY, index({ long: { scores: [0.1, 0.8, 0.1] }, peer: { scores: [0.7] } }));
    expect(hits.get('long')).toBeCloseTo(0.8, 2);
    expect(hits.get('peer')).toBeCloseTo(0.7, 2);
  });

  it('returns nothing when nothing clears the floor', () => {
    // Without this, every query returns the whole archive ranked by noise and "Nothing found" lies.
    expect(rankSemantic(QUERY, index({ a: { scores: [0.2] }, b: { scores: [MIN_SIMILARITY - 0.05] } })).size).toBe(0);
  });

  it('drops a weak hit that sits far below the best one', () => {
    const hits = rankSemantic(QUERY, index({ strong: { scores: [0.75] }, weak: { scores: [0.36] } }));
    expect([...hits.keys()]).toEqual(['strong']);
  });

  it('keeps a near-peer of the best hit', () => {
    const hits = rankSemantic(QUERY, index({ strong: { scores: [0.75] }, peer: { scores: [0.68] } }));
    expect([...hits.keys()].sort()).toEqual(['peer', 'strong']);
  });

  it('never returns more than the ceiling', () => {
    const many: Record<string, { scores: number[] }> = {};
    for (let i = 0; i < MAX_SEMANTIC_HITS + 15; i += 1) many[`d${i}`] = { scores: [0.8] };
    expect(rankSemantic(QUERY, index(many)).size).toBe(MAX_SEMANTIC_HITS);
  });

  it('abstains on a corrupt chunk rather than scoring it zero', () => {
    // Zero is a real similarity. Letting corruption vote is worse than letting it sit out.
    const withJunk = index({ a: { scores: [0.9] } });
    withJunk.notes.a = { stamp: 'x', chunks: ['!!!!', ...(withJunk.notes.a?.chunks ?? [])] };
    expect(rankSemantic(QUERY, withJunk).get('a')).toBeCloseTo(0.9, 2);
  });

  it('returns nothing when there is no index at all', () => {
    expect(rankSemantic(QUERY, null).size).toBe(0);
  });
});

describe('mergeSearchResults', () => {
  const archive = [
    note('2026-08-16', 'I prayed Fajr on time.'),
    note('2026-08-15', 'A hard evening, and I nearly gave up.'),
    note('2026-08-14', 'Read a page after ʿIshāʾ.'),
  ];

  it('is byte-for-byte the old search when there are no semantic hits', () => {
    // The regression guard for the entire feature: with the model off, absent, still downloading or
    // simply unhelpful, the Journal behaves exactly as it shipped.
    for (const query of ['fajr', 'ishaa', 'August', '2026-08', 'nothing here', '']) {
      const merged = mergeSearchResults({ archive, query, today: TODAY, semantic: new Map() });
      expect(merged.notes).toEqual(archive.filter((n) => matchesQuery(n, query, TODAY)));
      expect(merged.related.size).toBe(0);
    }
  });

  it('adds a note nobody typed the words of, and marks it', () => {
    const merged = mergeSearchResults({
      archive,
      query: 'felt like quitting',
      today: TODAY,
      semantic: new Map([['2026-08-15', 0.62]]),
    });

    expect(merged.notes.map((n) => n.note_date)).toEqual(['2026-08-15']);
    expect(merged.related.has('2026-08-15')).toBe(true);
  });

  it('does not mark a note that also contains the typed words', () => {
    // A row containing your words needs no explanation, and calling it "related" would be a demotion.
    const merged = mergeSearchResults({
      archive,
      query: 'Fajr',
      today: TODAY,
      semantic: new Map([['2026-08-16', 0.9]]),
    });

    expect(merged.notes.map((n) => n.note_date)).toEqual(['2026-08-16']);
    expect(merged.related.size).toBe(0);
  });

  it('treats an empty query as no search at all, even holding semantic hits', () => {
    const merged = mergeSearchResults({
      archive,
      query: '   ',
      today: TODAY,
      semantic: new Map([['2026-08-15', 0.9]]),
    });

    expect(merged.notes).toEqual(archive);
    expect(merged.related.size).toBe(0);
  });

  it('keeps archive order regardless of score', () => {
    // The screen is a reverse-chronological list grouped by month. Ranking by similarity would
    // destroy the structure people navigate by.
    const merged = mergeSearchResults({
      archive,
      query: 'quitting',
      today: TODAY,
      semantic: new Map([
        ['2026-08-14', 0.99],
        ['2026-08-16', 0.4],
        ['2026-08-15', 0.7],
      ]),
    });

    expect(merged.notes.map((n) => n.note_date)).toEqual(['2026-08-16', '2026-08-15', '2026-08-14']);
  });

  it('hands back the same empty set each time, so memos downstream do not churn', () => {
    const a = mergeSearchResults({ archive, query: '', today: TODAY, semantic: new Map() });
    const b = mergeSearchResults({ archive, query: '', today: TODAY, semantic: new Map() });
    expect(a.related).toBe(b.related);
  });
});

describe('archiveRowTrailing', () => {
  it('explains a semantic-only row while a query is active', () => {
    expect(archiveRowTrailing({ query: 'quitting', isRelated: true, spokenLabel: '2 min' })).toBe('related');
  });

  it('gives the spoken label back once the query clears', () => {
    expect(archiveRowTrailing({ query: '', isRelated: true, spokenLabel: '2 min' })).toBe('2 min');
  });

  it('shows the spoken label for an ordinary hit', () => {
    expect(archiveRowTrailing({ query: 'fajr', isRelated: false, spokenLabel: '40 sec' })).toBe('40 sec');
  });

  it('shows nothing for a typed note that matched no query', () => {
    expect(archiveRowTrailing({ query: '', isRelated: false, spokenLabel: null })).toBeNull();
  });
});

describe('journalEmptyCopy', () => {
  it('invites writing when there is no query', () => {
    expect(journalEmptyCopy({ query: '', semanticOn: true })).toMatchObject({ icon: 'journal' });
  });

  it('stops claiming only words were searched once meaning is on', () => {
    const off = journalEmptyCopy({ query: 'quitting', semanticOn: false });
    const on = journalEmptyCopy({ query: 'quitting', semanticOn: true });

    expect(off.body).toBe('No note has those words in it.');
    expect(on.body).not.toBe(off.body);
    expect(on.icon).toBe('searchOff');
  });
});
