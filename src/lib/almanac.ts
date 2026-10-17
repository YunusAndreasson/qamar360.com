/**
 * The "night before" line at the head of Today.
 *
 * Sunnah acts whose Hijri schedule begins tomorrow (the White Days, ʿĀshūrāʾ) otherwise surface for
 * the first time on the day itself, too late to prepare for: the suḥūr, the intention.
 *
 * Kept out of the component so the naming rule has a test: jest here matches `src/**\/*.test.ts`
 * only, and this is exactly the sort of "one, or a count" rule that reads as obviously right and
 * is wrong at the boundary.
 */

/**
 * What tomorrow is holding, in one line — or `null` when it is holding nothing, which renders no
 * line at all rather than an empty one.
 *
 * A single act is named. More than one is counted, because the line is one row high and a list
 * that truncates mid-title tells you less than a number does.
 */
export function tomorrowLine(actNames: readonly string[]): string | null {
  if (actNames.length === 1 && actNames[0]) return actNames[0];
  if (actNames.length > 1) return `${actNames.length} Sunnah acts`;
  return null;
}
