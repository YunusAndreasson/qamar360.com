import { beforeEach, expect, it, jest } from '@jest/globals';

import type { InsightSnapshot, InsightVersion } from '@/lib/local-insight-context';
import {
  clearLocalInsights,
  readLocalInsights,
  setLocalJournalUse,
  updateLocalInsights,
} from '@/lib/local-insight-store';

jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents/' },
  Directory: class {
    uri = 'file:///documents/local-insights';
    create() {}
  },
}));

const mockRows = new Map<string, string>();
let mockFailWrite = false;
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({
    execSync: jest.fn(),
    getFirstSync: (_sql: string, id: string) => (mockRows.has(id) ? { body: mockRows.get(id) } : null),
    runSync: (_sql: string, id: string, body: string) => {
      if (mockFailWrite) throw new Error('Disk full');
      mockRows.set(id, body);
    },
  }),
}));

beforeEach(() => {
  mockRows.clear();
  mockFailWrite = false;
});
it('isolates accounts and round-trips the Maps used by offline reading cards', () => {
  const snapshot = {
    reading: { quarter: { byHabit: new Map([['habit', { earned: 2, possible: 7 }]]) } },
    notes: [],
  } as unknown as InsightSnapshot;
  updateLocalInsights('a', (s) => ({ ...s, snapshots: { quarter: snapshot } }));
  expect(readLocalInsights('a').snapshots.quarter!.reading.quarter.byHabit.get('habit')).toEqual({
    earned: 2,
    possible: 7,
  });
  expect(readLocalInsights('b').snapshots).toEqual({});
});
it('purges direct and inherited journal-derived versions and advances the cancellation epoch', () => {
  const versions = [
    { id: 'safe', used_notes: false },
    { id: 'direct', used_notes: true },
    { id: 'inherited', used_notes: true, sourceIds: ['direct'] },
  ] as InsightVersion[];
  setLocalJournalUse('a', true);
  updateLocalInsights('a', (s) => ({
    ...s,
    versions,
    snapshots: { quarter: { notes: [{ body: 'private' }] } as InsightSnapshot },
  }));
  const epoch = readLocalInsights('a').epoch;
  setLocalJournalUse('a', false);
  const result = readLocalInsights('a');
  expect(result.versions.map((v) => v.id)).toEqual(['safe']);
  expect(result.snapshots.quarter!.notes).toEqual([]);
  expect(result.epoch).toBeGreaterThan(epoch);
});
it('a failed write retains the previously saved versions', () => {
  updateLocalInsights('a', (s) => ({ ...s, versions: [{ id: 'old' } as InsightVersion] }));
  mockFailWrite = true;
  expect(() =>
    updateLocalInsights('a', (s) => ({ ...s, versions: [...s.versions, { id: 'new' } as InsightVersion] })),
  ).toThrow('Disk full');
  expect(readLocalInsights('a').versions.map((v) => v.id)).toEqual(['old']);
});
it('clearing removes all inputs and versions without affecting a different account', () => {
  setLocalJournalUse('a', true);
  setLocalJournalUse('b', true);
  clearLocalInsights('a');
  expect(readLocalInsights('a')).toMatchObject({ notesEnabled: false, snapshots: {}, versions: [] });
  expect(readLocalInsights('b').notesEnabled).toBe(true);
});
