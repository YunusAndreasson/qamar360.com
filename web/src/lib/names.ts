/**
 * Name matching for habits & stacks — ported verbatim from the mobile app so the two clients
 * agree on what "already added" means. A preset becomes a habit by copying its name, and the only
 * link back to the catalog is that name, folded to a comparison form: trimmed, lower-cased, and
 * stripped of the transliteration marks (combining diacritics + ʿayn/hamza), so "Pray ʿAṣr on
 * time" matches "pray asr on time".
 */
export const normalizeName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining marks: ā→a, ṣ→s, ḥ→h, ū→u …
    .replace(/[ʾʿ‘’]/g, '') // ʾ ʿ ' ' — hamza/ʿayn and curly-quote forms
