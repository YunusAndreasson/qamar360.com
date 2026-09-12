import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import { useCatalog } from '@/hooks/use-catalog';
import type { Habit } from '@/hooks/use-habits';
import { useLatestRef } from '@/hooks/use-latest-ref';
import type { GoalReading } from '@/lib/goals';
import type { Reading } from '@/lib/insights';
import {
  LOCAL_PROMPT_VERSION,
  makeInsightSnapshot,
  selectInsightHistory,
  type InsightVersion,
} from '@/lib/local-insight-context';
import { checkInsightAbort, generateLocalInsight, INSIGHT_ARTIFACT } from '@/lib/local-insight-model';
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
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const currentUser = useLatestRef(userId);
  const notesEnabled = archive?.notesEnabled ?? false;
  const epoch = archive?.epoch ?? 0;
  const cancel = useCallback(() => active.current?.abort(), []);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        cancel();
      };
    }, [cancel]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancel();
    });
    return () => {
      sub.remove();
      cancel();
    };
  }, [cancel]);
  useEffect(() => {
    cancel();
  }, [userId, reading.id, epoch, cancel]);

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
  const generate = async () => {
    if (!userId || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError(null);
    let unsubscribe = () => {};
    try {
      const state = readLocalInsights(userId);
      const snapshot = state.snapshots[reading.id];
      if (!snapshot) throw new Error('Open this quarter online once to save its records.');
      unsubscribe = subscribeLocalInsights(() => {
        if (readLocalInsights(userId).epoch !== state.epoch) controller.abort();
      });
      const history = selectInsightHistory(state.versions, reading.id, state.notesEnabled);
      const input = state.notesEnabled ? snapshot : { ...snapshot, notes: [] };
      const result = await generateLocalInsight(input, history, controller.signal);
      checkInsightAbort(controller.signal);
      if (currentUser.current !== userId || readLocalInsights(userId).epoch !== state.epoch) return;
      const at = new Date().toISOString();
      const version: InsightVersion = {
        ...result,
        id: `local:${at}:${Math.random().toString(36).slice(2)}`,
        reading_id: reading.id,
        generated_at: at,
        origin: 'local',
        model: INSIGHT_ARTIFACT,
        promptVersion: LOCAL_PROMPT_VERSION,
        snapshotAt: snapshot.capturedAt,
        sourceIds: history.map((v) => v.id),
        used_notes: input.notes.length > 0 || history.some((v) => v.used_notes),
      };
      updateLocalInsights(userId, (s) => ({ ...s, versions: [...s.versions, version] }));
      setSelected(version.id);
    } catch (caught) {
      if (currentUser.current === userId)
        setError(
          controller.signal.aborted
            ? 'Generation cancelled. Saved versions are unchanged.'
            : caught instanceof Error
              ? caught.message
              : 'Could not generate a reflection.',
        );
    } finally {
      unsubscribe();
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  return {
    insight,
    versions,
    selected: insight?.id ?? null,
    select: setSelected,
    generate,
    cancel,
    busy,
    error,
    snapshot: archive?.snapshots[reading.id],
    history: archive?.versions ?? [],
  };
}
