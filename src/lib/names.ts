/**
 * Name matching for habits & stacks. Nothing in the DB enforces name uniqueness, so the app
 * rejects duplicates itself — and Discover's "already added ✓" check has to normalize a name the
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

/**
 * A fresh routine's placeholder name for the drop-one-habit-onto-another gesture: the routine is
 * created instantly (no name prompt — see the ⋯ → Rename affordance), so it needs a sensible
 * default. Deduped against existing stacks so repeated merges read "New routine", "New routine 2",
 * "New routine 3" … rather than colliding (createStack does not dedupe names itself).
 */
export const defaultRoutineName = (stacks: { id: string; name: string }[]) => {
  const base = 'New routine';
  const taken = new Set(otherNames(stacks));
  if (!taken.has(normalizeName(base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(normalizeName(candidate))) return candidate;
  }
};
