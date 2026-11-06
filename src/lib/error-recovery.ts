/**
 * What the error screen offers once the app's tree has thrown while rendering.
 *
 * A failure soon after "Try again" is the same failure: rendering the tree again throws again. The
 * screen then offers a restart instead, which starts the JavaScript afresh, on a newer update if
 * one has downloaded since launch (the cure for a bad one). It never restarts by itself: a restart
 * that failed the same way would loop with no way out.
 */
export const REPEAT_FAILURE_MS = 10_000;

export type Recovery = 'retry' | 'restart';

/** `lastRetryAt` is when "Try again" was last pressed, `failedAt` when the tree threw. */
export function recoveryFor(lastRetryAt: number | null, failedAt: number): Recovery {
  return lastRetryAt !== null && failedAt - lastRetryAt < REPEAT_FAILURE_MS ? 'restart' : 'retry';
}
