/**
 * A count goal ("Drank water · 8 cups") counted the way it is lived: one tap per cup.
 *
 * Ticking such a habit used to log its whole target at once, so the count the editor asked for was
 * only ever a caption, and the partial credit Progress already computes for it (`creditFor`) could
 * not be reached from the screen. Now a tap adds one, the tap that reaches the target is the one
 * that completes the habit, and a tap on a completed one clears the day as it always did. A slip is
 * taken back one at a time from the habit's `⋯` sheet.
 *
 * Pure, so the rule has a test; `use-habits` turns a step into the write.
 */

/** What a step leaves on the day's row. `clear` deletes it; the others upsert it. */
export type CountStep = { status: 'clear' } | { status: 'partial' | 'done'; count: number };

/** One tap on a count goal standing at `count` of `target`, `done` when the row already says so. */
export function countTap(count: number, target: number, done: boolean): CountStep {
  if (done || count >= target) return { status: 'clear' };
  const next = count + 1;
  return next >= target ? { status: 'done', count: target } : { status: 'partial', count: next };
}

/** One taken back: a completed goal steps down from its target, and the last one clears the row. */
export function countTakeBack(count: number, target: number, done: boolean): CountStep {
  const from = done ? target : count;
  if (from <= 1) return { status: 'clear' };
  return { status: 'partial', count: Math.min(from, target) - 1 };
}

/**
 * The goal as a row reads it: "8 cups" while nothing is logged or once it is met, "3 of 8 cups"
 * partway. The unit is optional in the editor, so it may be absent.
 */
export function countGoalLabel(target: number, unit: string | null | undefined, count = 0, done = false): string {
  const goal = `${target}${unit ? ` ${unit}` : ''}`;
  return !done && count > 0 && count < target ? `${count} of ${goal}` : goal;
}

/** What a tap on a row does, for its accessibility hint: a count goal counts one, a done row clears
 *  the day, anything else is marked done. */
export function toggleHint(done: boolean, counted: boolean): string {
  if (done) return 'Takes it back for today.';
  return counted ? 'Counts one.' : 'Marks it done for today.';
}
