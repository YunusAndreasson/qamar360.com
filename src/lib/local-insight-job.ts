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

// Each phase owns a stretch of one attempt. Loading and reading report nothing while they run, so
// a heartbeat eases through their stretch: iOS ends background work that shows no progress, and a
// frozen bar reads as a hang. The ease slows as it goes and never reaches the next phase.
const STRETCH: Record<InsightProgress['phase'], [number, number]> = {
  loading: [0, 0.1],
  reading: [0.1, 0.2],
  writing: [0.2, 1],
};
const HEARTBEAT_MS = 1000;
const EASE_MS = 20_000;
// The bar stops short of full until the reply is validated and saved.
const CEILING = 0.95;

type StopReason = 'you' | 'outside' | 'left' | 'account' | 'settings';
const STOPPED: Record<StopReason, string> = {
  you: 'Generation cancelled. Saved versions are unchanged.',
  outside: 'Writing was stopped outside the app. Saved versions are unchanged.',
  left: 'Writing stopped when you left the app. Saved versions are unchanged.',
  account: 'Writing stopped because the account changed. Saved versions are unchanged.',
  settings: 'Writing stopped because on-device insight settings changed.',
};

export type ReflectionJob = {
  userId: string;
  readingId: string;
  phase: InsightProgress['phase'];
  /** 0 to 1. It never moves backwards; a retry fills the rest of the bar instead of rewinding it. */
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
let stopCurrent: ((reason: StopReason) => void) | null = null;
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
export function cancelReflection(reason: StopReason = 'you') {
  stopCurrent?.(reason);
}

/**
 * Generates and saves a new reflection for one quarter. It runs outside any screen, so leaving the
 * reading keeps it going. Leaving the app keeps it going only where the system agreed to continued
 * work. Elsewhere backgrounding cancels it, because a suspended app holding the model is the first
 * one the system reclaims.
 */
export async function startReflection(userId: string, readingId: string) {
  if (stopCurrent) return;
  const local = new AbortController();
  const run = {
    work: null as ContinuedWork | null,
    succeeded: null as boolean | null,
    stopped: null as StopReason | null,
    // Where the current attempt starts on the bar, and when its current phase began.
    base: 0,
    phaseStarted: Date.now(),
  };
  const stop = (reason: StopReason) => {
    if (local.signal.aborted) return;
    run.stopped = reason;
    local.abort();
  };
  stopCurrent = stop;
  publish({ job: { userId, readingId, phase: 'loading', fraction: 0, draft: [], background: false }, error: null });

  const show = (phase: InsightProgress['phase'], withinAttempt: number, draft: string[]) => {
    const fraction = Math.max(state.job?.fraction ?? 0, run.base + (CEILING - run.base) * withinAttempt);
    patchJob({ phase, fraction, draft });
    run.work?.update(PHASE_LABEL[phase], fraction);
  };
  const heartbeat = setInterval(() => {
    const phase = state.job?.phase;
    if (!phase || phase === 'writing') return;
    const [floor, top] = STRETCH[phase];
    const eased = 0.9 * (1 - Math.exp(-(Date.now() - run.phaseStarted) / EASE_MS));
    show(phase, floor + (top - floor) * eased, []);
  }, HEARTBEAT_MS);
  let unsubscribe = () => {};
  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'background' && !run.work) stop('left');
  });
  try {
    const archive = readLocalInsights(userId);
    const snapshot = archive.snapshots[readingId];
    if (!snapshot) throw new Error('Open this quarter online once to save its records.');
    unsubscribe = subscribeLocalInsights(() => {
      if (readLocalInsights(userId).epoch !== archive.epoch) stop('settings');
    });
    let begun = false;
    const history = selectInsightHistory(archive.versions, readingId, archive.notesEnabled);
    const input = archive.notesEnabled ? snapshot : { ...snapshot, notes: [] };
    const result = await generateLocalInsight(input, history, local.signal, (progress) => {
      // Asked for only once the model is known to be present and the records fit, so a quick
      // failure never flashes a Live Activity or a notification.
      if (!begun) {
        begun = true;
        void beginContinuedWork(TITLE, PHASE_LABEL[progress.phase], (reason) =>
          stop(reason === 'cancelled' ? 'you' : 'outside'),
        ).then((work) => {
          if (!work) return;
          if (run.succeeded !== null) return work.end(run.succeeded);
          run.work = work;
          patchJob({ background: true });
        });
      }
      const previous = state.job?.phase;
      if (progress.phase !== previous) {
        run.phaseStarted = Date.now();
        // Loading again after writing is the retry: it gets the rest of the bar.
        if (progress.phase === 'loading' && previous === 'writing') run.base = state.job?.fraction ?? run.base;
      }
      const [floor, top] = STRETCH[progress.phase];
      const within =
        progress.phase === 'writing' ? floor + (top - floor) * Math.min(progress.tokens / EXPECTED_TOKENS, 1) : floor;
      show(progress.phase, within, progress.phase === 'writing' ? draftParagraphs(progress.text) : []);
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
          ? STOPPED[run.stopped ?? 'you']
          : caught instanceof Error
            ? caught.message
            : 'Could not generate a reflection.',
      },
    });
  } finally {
    clearInterval(heartbeat);
    run.succeeded ??= false;
    run.work?.end(run.succeeded);
    appState.remove();
    unsubscribe();
    stopCurrent = null;
    publish({ job: null });
  }
}
