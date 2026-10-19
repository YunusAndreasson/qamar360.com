/**
 * Name matching for habits & stacks. Nothing in the DB enforces name uniqueness, so the app
 * rejects duplicates itself (stacks across the account, habits within their stack) — and Discover's "already added ✓" check has to normalize a name the
 * exact same way the editors' collision check does, or the two silently drift. One normalizer,
 * one place.
 */

/**
 * A name folded to its comparison form — trimmed, lower-cased, and stripped of the
 * transliteration marks (combining diacritics plus the ʿayn/hamza letters), so a preset
 * renamed with scholarly diacritics still matches a habit saved before the rename:
 * "Pray ʿAṣr on time" ↔ "pray asr on time". Without the folding, Discover's "already
 * added ✓" check offers the renamed preset as new and one tap creates a near-duplicate.
 */
export const normalizeName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining marks: ā→a, ṣ→s, ḥ→h, ū→u …
    .replace(/[ʾʿ‘’]/g, ''); // ʾ ʿ ' ' — hamza/ʿayn and curly-quote forms

/** Normalized names of every item except `id` — the collision set an editor rejects a name against. */
export const otherNames = <T extends { id: string; name: string }>(items: T[], id?: string) =>
  items.filter((item) => item.id !== id).map((item) => normalizeName(item.name));

/** Whether `trimmed` collides with an {@link otherNames} set once folded through
 *  {@link normalizeName} — an empty candidate never counts as a duplicate. Shared by every
 *  name-collecting form (habit, exchange, and stack create/rename), so "no DB uniqueness
 *  constraint, the app enforces it" stays one rule instead of four re-implementations. */
export const isDuplicateName = (trimmed: string, existingNames: string[]) =>
  trimmed.length > 0 && existingNames.includes(normalizeName(trimmed));

/**
 * {@link otherNames} narrowed to the habits beside one: the same stack, or (`stackId` null) the
 * loose habits and exchanges. A habit's name only has to be told apart from its neighbours — the
 * same deed may stand in several stacks ("Read Qurʾān" after Fajr and again after ʿIshāʾ), each
 * its own row with its own ticks, and the card it sits in is what tells them apart.
 */
export const siblingNames = <T extends { id: string; name: string; stack_id: string | null }>(
  habits: T[],
  stackId: string | null,
  id?: string,
) => otherNames(habits.filter((h) => h.stack_id === stackId), id);

type Placed = { id: string; name: string; stack_id: string | null };

/**
 * The name a move must refuse: moving `habitId` into `toStackId` (null = out among the loose
 * habits and exchanges) would set it beside a same-named one, so the container would hold two
 * identical rows that nothing on screen tells apart. Null when the move may go. A move within the
 * habit's own container (a reorder) never clashes — whatever already stands there stands.
 *
 * {@link siblingNames} is the rule the editors check a typed name against; this is the same rule
 * for a habit that keeps its name and changes neighbours, so every door into a stack (the picker,
 * the drag, Discover, "Anchor all") refuses the same thing.
 */
export const clashOnMove = <T extends Placed>(habits: T[], habitId: string, toStackId: string | null) => {
  const habit = habits.find((h) => h.id === habitId);
  if (!habit || (habit.stack_id ?? null) === toStackId) return null;
  return isDuplicateName(habit.name.trim(), siblingNames(habits, toStackId, habitId)) ? habit.name : null;
};

/** What a refused move tells the user — where it would have gone, and what is already there. */
export const moveRefusal = (stackName: string | null, name: string) =>
  stackName ? `${stackName} already has “${name}”` : `“${name}” is already in Habits`;

/**
 * For each act, the stacks it may NOT be dropped into because they already hold its name — what the
 * Today drag reads so a card that would refuse the act never lights up as a target. Built once per
 * render, not per frame: one pass to fold each stack's names, one to look each act up.
 */
export function refusedStacks<T extends Placed>(habits: T[]): Map<string, string[]> {
  const byStack = new Map<string, Set<string>>();
  for (const h of habits) {
    if (!h.stack_id) continue;
    const names = byStack.get(h.stack_id) ?? new Set<string>();
    names.add(normalizeName(h.name));
    byStack.set(h.stack_id, names);
  }
  const refused = new Map<string, string[]>();
  for (const h of habits) {
    const name = normalizeName(h.name);
    const ids = [...byStack].filter(([id, names]) => id !== h.stack_id && names.has(name)).map(([id]) => id);
    if (ids.length > 0) refused.set(h.id, ids);
  }
  return refused;
}
