import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { useCatalog } from '@/hooks/use-catalog';
import type { Habit } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import type { GoalReading } from '@/lib/goals';
import type { Reading } from '@/lib/insights';
import { makeInsightSnapshot } from '@/lib/local-insight-context';
import {
  cancelReflection,
  reflectionJobState,
  startReflection,
  subscribeReflectionJob,
} from '@/lib/local-insight-job';
import {
  localInsightRevision,
  readLocalInsights,
  subscribeLocalInsights,
  updateLocalInsights,
} from '@/lib/local-insight-store';
import { parsePersonalizedInsight } from '@/lib/personalized-insights';
import { usePreference } from '@/lib/preferences';
import { supabase } from '@/lib/supabase';

export function useLocalInsightArchive() {
  const { user } = useAuth();
  const revision = useSyncExternalStore(subscribeLocalInsights, localInsightRevision, localInsightRevision);
  return useMemo(() => {
    void revision; // SQLite changes are signalled through this external-store revision.
    try {
      return user ? readLocalInsights(user.id) : null;
    } catch {
      return null;
    }
  }, [user, revision]);
}

export function useLocalInsights(reading: Reading, habits: Habit[], goals: GoalReading[], live: boolean) {
  const { user } = useAuth();
  const userId = user?.id;
  const archive = useLocalInsightArchive();
  const { presets } = useCatalog();
  const offset = usePreference('hijriOffset');
  const { job: running, error: failure } = useSyncExternalStore(
    subscribeReflectionJob,
    reflectionJobState,
    reflectionJobState,
  );
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const currentUser = useLatestRef(userId);
  const notesEnabled = archive?.notesEnabled ?? false;
  const epoch = archive?.epoch ?? 0;
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  // A reflection outlives the screen that started it, but never the account.
  useEffect(() => {
    if (running && running.userId !== userId) cancelReflection();
  }, [running, userId]);

  // Only cache newly fetched records. Offline rendering never overwrites a saved snapshot
  // with the empty initial arrays from useProgress/useGoals.
  useEffect(() => {
    if (!userId || !focused || !live || !reading.closed) return;
    const controller = new AbortController();
    const snapshot = makeInsightSnapshot(reading, habits, goals, presets, offset);
    const valid = () =>
      !controller.signal.aborted && currentUser.current === userId && readLocalInsights(userId).epoch === epoch;
    void (async () => {
      try {
        if (!valid()) return;
        updateLocalInsights(userId, (s) => ({ ...s, snapshots: { ...s.snapshots, [reading.id]: snapshot } }));
        const [notes, legacy] = await Promise.all([
          notesEnabled
            ? supabase
                .from('daily_notes')
                .select('note_date,body')
                .eq('user_id', userId)
                .gte('note_date', reading.span.startISO)
                .lte('note_date', reading.span.endISO)
                .order('note_date')
                .abortSignal(controller.signal)
            : Promise.resolve({ data: [], error: null }),
          supabase.from('generated_insights').select('*').eq('user_id', userId).abortSignal(controller.signal),
        ]);
        if (!valid()) return;
        updateLocalInsights(userId, (state) => {
          const versions = [...state.versions];
          for (const row of legacy.data ?? []) {
            const id = `legacy:${row.reading_id}:${row.generated_at}`;
            if (versions.some((v) => v.id === id) || (row.used_notes && !state.notesEnabled)) continue;
            const parsed = parsePersonalizedInsight({ insight: { ...row, evidence: row.evidence_text } });
            if (parsed)
              versions.push({
                ...parsed,
                id,
                origin: 'legacy',
                model: row.model,
                promptVersion: row.prompt_version,
                snapshotAt: row.generated_at,
                sourceIds: [],
              });
          }
          return {
            ...state,
            versions,
            snapshots: {
              ...state.snapshots,
              [reading.id]: {
                ...snapshot,
                notes:
                  state.notesEnabled && !notes.error
                    ? (notes.data ?? []).map((n) => ({ date: n.note_date, body: n.body }))
                    : [],
              },
            },
          };
        });
        if (notes.error)
          setError('Journal entries could not be refreshed. This saved snapshot uses recorded metrics only.');
      } catch {
        if (!controller.signal.aborted) setError('Could not save this quarter for offline use.');
      }
    })();
    return () => controller.abort();
  }, [userId, focused, live, reading, habits, goals, presets, offset, notesEnabled, epoch, currentUser]);

  const versions = useMemo(
    () =>
      (archive?.versions ?? [])
        .filter((v) => v.reading_id === reading.id)
        .sort((a, b) => b.generated_at.localeCompare(a.generated_at) || b.id.localeCompare(a.id)),
    [archive, reading.id],
  );
  const insight = versions.find((v) => v.id === selected) ?? versions[0] ?? null;
  const job = running && running.userId === userId && running.readingId === reading.id ? running : null;
  const generate = () => {
    if (!userId) return;
    setError(null);
    // Land on the new version when it is saved, not on whichever one was picked before.
    setSelected(null);
    void startReflection(userId, reading.id);
  };
  return {
    insight,
    versions,
    selected: insight?.id ?? null,
    select: setSelected,
    generate,
    cancel: cancelReflection,
    /** This quarter's reflection while it is being written. */
    job,
    /** Another quarter's reflection is being written, and only one runs at a time. */
    elsewhere: running !== null && job === null,
    error: (failure && failure.userId === userId && failure.readingId === reading.id ? failure.message : null) ?? error,
    snapshot: archive?.snapshots[reading.id],
    history: archive?.versions ?? [],
  };
}
