/**
 * Name matching for habits & stacks. Nothing in the DB enforces name uniqueness, so the app
 * rejects duplicates itself — and Discover's "already added ✓" check has to normalize a name the
 * exact same way the editors' collision check does, or the two silently drift. One normalizer,
 * one place.
 */

/** A name folded to its comparison form — trimmed and lower-cased. */
export const normalizeName = (name: string) => name.trim().toLowerCase();

/** Normalized names of every item except `id` — the collision set an editor rejects a name against. */
export const otherNames = <T extends { id: string; name: string }>(items: T[], id?: string) =>
  items.filter((item) => item.id !== id).map((item) => normalizeName(item.name));
