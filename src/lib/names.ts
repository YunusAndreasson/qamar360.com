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
