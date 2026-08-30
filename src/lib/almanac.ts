/**
 * The "night before" line at the head of Today.
 *
 * Two different things can be waiting on tomorrow, and they arrive from opposite directions: Sunnah
 * acts whose Hijri schedule begins then, and to-dos you deliberately put there from a plan. The
 * second is the reason this line now takes an argument it didn't need before — a to-do dated ahead
 * belongs to that day and shows on no other (`tasks.showsOn`), and the day view only reaches
 * backwards, so without this there would be nowhere at all to see one until it arrived.
 *
 * Kept out of the component so the naming rule has a test: jest here matches `src/**\/*.test.ts`
 * only, and this is exactly the sort of "one, or a count" rule that reads as obviously right and
 * is wrong at the boundary.
 */

/**
 * What tomorrow is holding, in one line — or `null` when it is holding nothing, which renders no
 * line at all rather than an empty one.
 *
 * A single thing is named. More than one is counted, because the line is one row high and a list
 * that truncates mid-title tells you less than a number does. The two kinds are counted separately
 * so "3 Sunnah acts, Ferry tickets" still names the one thing you chose to put there.
 */
export function tomorrowLine(actNames: readonly string[], todoTitles: readonly string[]): string | null {
  const parts: string[] = [];
  if (actNames.length === 1 && actNames[0]) parts.push(actNames[0]);
  else if (actNames.length > 1) parts.push(`${actNames.length} Sunnah acts`);
  if (todoTitles.length === 1 && todoTitles[0]) parts.push(todoTitles[0]);
  else if (todoTitles.length > 1) parts.push(`${todoTitles.length} to-dos`);
  return parts.length > 0 ? parts.join(', ') : null;
}
