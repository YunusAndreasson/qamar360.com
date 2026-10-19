/**
 * A count goal ("Drank water · 8 cups") counted the way it is lived: one tap per cup.
 *
 * Ticking such a habit used to log its whole target at once, so the count the editor asked for was
 * only ever a caption, and the partial credit Progress already computes for it (`creditFor`) could
 * not be reached from the screen. Now a tap adds one, and the tap that reaches the target is the one
 * that completes the habit.
 *
 * **A tap on a completed one takes one back** (8 done → 7 of 8), mirroring how a tap on a done
 * binary row un-does it, but costing one unit rather than the day. It used to clear the whole day,
 * which made one habitual extra tap on a full glass cost all eight with nothing to undo; a binary
 * row loses nothing it can't win back with the next tap, and now neither does this. A slip can also
 * be taken back one at a time from the habit's `⋯` sheet, and the last one taken back clears the row.
 *
 * Pure, so the rule has a test; `use-habits` turns a step into the write.
 */

/** What a step leaves on the day's row. `clear` deletes it; the others upsert it. */
export type CountStep = { status: 'clear' } | { status: 'partial' | 'done'; count: number };

/** One tap on a count goal standing at `count` of `target`, `done` when the row already says so. */
export function countTap(count: number, target: number, done: boolean): CountStep {
  // Done: the tap un-does one unit, exactly as the `⋯` sheet's "Take one back" would.
  if (done) return countTakeBack(count, target, true);
  // A 'partial' row already at (or past) its target — logged before a target was lowered, or out of
  // sync some other way — is a met goal the row never said so about. The tap says it: done, at the
  // target. (Treating it as "done" and taking one back would punish the user for our stale row.)
  if (count >= target) return { status: 'done', count: target };
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

/** What a tap on a row does, for its accessibility hint — one wording per gesture, shared by every
 *  row that can be tapped (act rows and the stackless rows alike), so the same tap is never
 *  described two ways. A count goal counts one, and once met a tap takes one back; a done binary
 *  row is taken back for the day; anything else is marked done. */
export function toggleHint(done: boolean, counted: boolean): string {
  if (done) return counted ? 'Takes one back.' : 'Takes it back for today.';
  return counted ? 'Counts one.' : 'Marks it done for today.';
}
