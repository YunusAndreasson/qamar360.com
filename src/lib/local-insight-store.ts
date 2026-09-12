import { Directory, Paths } from 'expo-file-system';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import type { InsightSnapshot, InsightVersion } from '@/lib/local-insight-context';

export type LocalInsightState = {
  notesEnabled: boolean;
  epoch: number;
  snapshots: Record<string, InsightSnapshot>;
  versions: InsightVersion[];
};
const empty = (): LocalInsightState => ({ notesEnabled: false, epoch: 0, snapshots: {}, versions: [] });
let db: SQLiteDatabase | undefined;
let revision = 0;
const listeners = new Set<() => void>();
export function subscribeLocalInsights(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function localInsightRevision() {
  return revision;
}
function database() {
  if (!db) {
    const directory = new Directory(Paths.document, 'local-insights');
    directory.create({ intermediates: true, idempotent: true });
    const opened = openDatabaseSync('local-insights-v1.db', {}, directory.uri);
    opened.execSync(
      'PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY NOT NULL, body TEXT NOT NULL)',
    );
    db = opened;
  }
  return db;
}
// Reading's tallies contain Maps; preserve them across an offline cold start.
function encode(value: LocalInsightState) {
  return JSON.stringify(value, (_key, v: unknown) => (v instanceof Map ? { __insightMap: [...v] } : v));
}
export function readLocalInsights(userId: string): LocalInsightState {
  const row = database().getFirstSync<{ body: string }>('SELECT body FROM accounts WHERE id=?', userId);
  if (!row) return empty();
  return JSON.parse(row.body, (_key, value: unknown) => {
    if (value && typeof value === 'object' && '__insightMap' in value && Array.isArray(value.__insightMap))
      return new Map(value.__insightMap as [string, unknown][]);
    return value;
  }) as LocalInsightState;
}
export function updateLocalInsights(userId: string, update: (state: LocalInsightState) => LocalInsightState) {
  // A single synchronous SQLite statement commits the whole account mutation atomically.
  const next = update(readLocalInsights(userId));
  database().runSync(
    'INSERT INTO accounts (id,body) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
    userId,
    encode(next),
  );
  revision += 1;
  listeners.forEach((listener) => listener());
}
export function setLocalJournalUse(userId: string, enabled: boolean) {
  updateLocalInsights(userId, (state) => ({
    ...state,
    notesEnabled: enabled,
    epoch: state.epoch + 1,
    snapshots: Object.fromEntries(
      Object.entries(state.snapshots).map(([id, s]) => [id, enabled ? s : { ...s, notes: [] }]),
    ),
    versions: enabled ? state.versions : state.versions.filter((v) => !v.used_notes),
  }));
}
export function clearLocalInsights(userId: string) {
  updateLocalInsights(userId, (state) => ({ ...empty(), epoch: state.epoch + 1 }));
}
