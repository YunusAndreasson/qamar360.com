import { AppState } from 'react-native';

import { beginContinuedWork, type ContinuedWork } from '@/lib/continued-work';
import {
  draftParagraphs,
  LOCAL_PROMPT_VERSION,
  selectInsightHistory,
  type InsightVersion,
} from '@/lib/local-insight-context';
import {
  checkInsightAbort,
  generateLocalInsight,
  INSIGHT_ARTIFACT,
  type InsightProgress,
} from '@/lib/local-insight-model';
import { readLocalInsights, subscribeLocalInsights, updateLocalInsights } from '@/lib/local-insight-store';

// About how many tokens a finished reflection takes; a replay of the real model wrote 288. It only
// scales the progress bar, and generation is never cut off at it.
const EXPECTED_TOKENS = 320;
const TITLE = 'Writing your reflection';
export const PHASE_LABEL: Record<InsightProgress['phase'], string> = {
  loading: 'Loading the model',
  reading: 'Reading this quarter',
  writing: 'Writing',
};

export type ReflectionJob = {
  userId: string;
  readingId: string;
  phase: InsightProgress['phase'];
  /** 0 to 1. It never moves backwards, so a retry doesn't rewind the system's progress UI. */
  fraction: number;
  /** The paragraphs so far. They are unvalidated, so they are shown as a draft and never saved. */
  draft: string[];
  /** The system agreed to keep the work running outside the app. */
  background: boolean;
};
type JobState = {
  job: ReflectionJob | null;
  error: { userId: string; readingId: string; message: string } | null;
};

let state: JobState = { job: null, error: null };
let controller: AbortController | null = null;
const listeners = new Set<() => void>();
const publish = (next: Partial<JobState>) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};
const patchJob = (next: Partial<ReflectionJob>) => {
  if (state.job) publish({ job: { ...state.job, ...next } });
};

export const reflectionJobState = () => state;
export function subscribeReflectionJob(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
export function cancelReflection() {
  controller?.abort();
}

function fractionOf(progress: InsightProgress) {
  if (progress.phase === 'loading') return 0.02;
  if (progress.phase === 'reading') return 0.1;
  return 0.1 + 0.85 * Math.min(progress.tokens / EXPECTED_TOKENS, 1);
}

/**
 * Generates and saves a new reflection for one quarter. It runs outside any screen, so leaving the
 * reading keeps it going. Leaving the app keeps it going only where the system agreed to continued
 * work. Elsewhere backgrounding cancels it, because a suspended app holding the model is the first
 * one the system reclaims.
 */
export async function startReflection(userId: string, readingId: string) {
  if (controller) return;
  const local = new AbortController();
  controller = local;
  publish({ job: { userId, readingId, phase: 'loading', fraction: 0, draft: [], background: false }, error: null });
  const run = { work: null as ContinuedWork | null, succeeded: null as boolean | null };
  let unsubscribe = () => {};
  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'background' && !run.work) local.abort();
  });
  try {
    const archive = readLocalInsights(userId);
    const snapshot = archive.snapshots[readingId];
    if (!snapshot) throw new Error('Open this quarter online once to save its records.');
    unsubscribe = subscribeLocalInsights(() => {
      if (readLocalInsights(userId).epoch !== archive.epoch) local.abort();
    });
    let begun = false;
    const history = selectInsightHistory(archive.versions, readingId, archive.notesEnabled);
    const input = archive.notesEnabled ? snapshot : { ...snapshot, notes: [] };
    const result = await generateLocalInsight(input, history, local.signal, (progress) => {
      // Asked for only once the model is known to be present and the records fit, so a quick
      // failure never flashes a Live Activity or a notification.
      if (!begun) {
        begun = true;
        void beginContinuedWork(TITLE, PHASE_LABEL[progress.phase], () => local.abort()).then((work) => {
          if (!work) return;
          if (run.succeeded !== null) return work.end(run.succeeded);
          run.work = work;
          patchJob({ background: true });
        });
      }
      const fraction = Math.max(state.job?.fraction ?? 0, fractionOf(progress));
      patchJob({
        phase: progress.phase,
        fraction,
        draft: progress.phase === 'writing' ? draftParagraphs(progress.text) : [],
      });
      run.work?.update(PHASE_LABEL[progress.phase], fraction);
    });
    checkInsightAbort(local.signal);
    if (readLocalInsights(userId).epoch !== archive.epoch) return;
    const at = new Date().toISOString();
    const version: InsightVersion = {
      ...result,
      id: `local:${at}:${Math.random().toString(36).slice(2)}`,
      reading_id: readingId,
      generated_at: at,
      origin: 'local',
      model: INSIGHT_ARTIFACT,
      promptVersion: LOCAL_PROMPT_VERSION,
      snapshotAt: snapshot.capturedAt,
      sourceIds: history.map((v) => v.id),
      used_notes: input.notes.length > 0 || history.some((v) => v.used_notes),
    };
    updateLocalInsights(userId, (s) => ({ ...s, versions: [...s.versions, version] }));
    run.succeeded = true;
  } catch (caught) {
    publish({
      error: {
        userId,
        readingId,
        message: local.signal.aborted
          ? 'Generation cancelled. Saved versions are unchanged.'
          : caught instanceof Error
            ? caught.message
            : 'Could not generate a reflection.',
      },
    });
  } finally {
    run.succeeded ??= false;
    run.work?.end(run.succeeded);
    appState.remove();
    unsubscribe();
    controller = null;
    publish({ job: null });
  }
}
