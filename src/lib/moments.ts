import type { IconName } from '@/constants/icons';
import { asDayPart, type DayPart } from '@/lib/sun';

/**
 * Moments — the occasions a stack can be anchored to. The user picks ONE thing (icon + label
 * together, always optional) and everything else derives from it:
 *
 *  - **identity**: the stack's leading emblem is the moment's icon, worn always — so two
 *    night stacks are never two moons ("Going to bed" wears the zzz-moon, "ʿIshāʾ" the
 *    starry one).
 *  - **the day's order**: each moment maps to a {@link DayPart} band underneath, which places a
 *    new stack in the day's sequence. Nothing reacts to which band the clock is in: the
 *    time-of-day lighting and its "until HH:MM" caption were removed (2026-10-18). Jumuʿah has
 *    no band; it is a weekday moment.
 *
 * The four sky moments share their keys with {@link DayPart} — a legacy `day_part`-only row
 * (or a stale cached snapshot without the column) resolves through {@link momentOf} unchanged.
 * `habit_stacks.moment` stores the key; `day_part` keeps holding the derived band so nothing
 * downstream of it changes.
 */
export type MomentDef = {
  /**
   * What the picker shows: the **completed deed** you are anchoring to, in the same past-tense
   * voice every habit is named in ("Prayed Fajr", "Got into bed"). A stack survives because it
   * hangs off something that already happened — a clock can't remind you of anything — so the
   * cell has to name an act, not an hour. The four sky moments are the deliberate exception:
   * nothing *happens* at midday, so they keep their plain noun and the picker files them under
   * the weakest-cue group rather than pretending otherwise.
   */
  label: string;
  /**
   * Default name for a stack created on this moment — the occasion as the card header reads it
   * ("Fajr"), which is not the same sentence as the deed you anchored to ("Prayed Fajr").
   *
   * **No leading "After"** (dropped 2026-08-05): with nine of thirteen defaults starting on the
   * same word, a folded day was a column of cards whose first word carried no information and
   * whose distinguishing word sat at a different x on every row. The relation is not lost — the
   * stack still *stores* its moment, the picker still files it under PRAYERS / SOMETHING YOU DID,
   * and "Fajr" as the name of a block of your day is how it is said out loud anyway. Keep new
   * entries prefix-free; `moments.test.ts` pins it.
   */
  stackName: string;
  /** Emblem in the {@link Icons} registry — the stack's identity glyph. */
  icon: IconName;
  /** The day-cycle band the moment lives in; null only for weekday moments. */
  band: DayPart | null;
};

const MOMENT_DEFS = {
  // ── Sky (the four day parts; keys == DayPart) ───────────────────────────
  // No deed to name: a band opening is something the sun does, not something you did. Kept
  // because they carry the day's light and the legacy `day_part` rows, but filed last.
  morning: { label: 'Morning', stackName: 'Morning', icon: 'sunrise', band: 'morning' },
  midday: { label: 'Midday', stackName: 'Midday', icon: 'sun', band: 'midday' },
  evening: { label: 'Evening', stackName: 'Evening', icon: 'sunset', band: 'evening' },
  night: { label: 'Night', stackName: 'Night', icon: 'moon', band: 'night' },
  // ── Life moments — each one an act with an unmistakable finish ───────────
  'waking-up': { label: 'Woke up', stackName: 'Waking up', icon: 'wake', band: 'morning' },
  'before-dawn': {
    label: 'Woke in the night',
    stackName: 'Rising at night',
    icon: 'preDawn',
    band: 'night',
  },
  bedtime: { label: 'Got into bed', stackName: 'Getting into bed', icon: 'bedtime', band: 'night' },
  // ── Prayers (sun-position icons — their windows are solar by definition) ─
  // The strongest cues in the app: a prayer has a definite end, happens daily, and is already
  // automatic. The anchor is *having prayed it*, never the hour it falls in.
  fajr: { label: 'Prayed Fajr', stackName: 'Fajr', icon: 'fajr', band: 'morning' },
  // The one prayer moment that is itself voluntary, and the exception worth stating: every other
  // cue in this file is a deed you already do, and Ḍuḥā is one you are taking up. That makes it a
  // weaker anchor on the day it is chosen and a perfectly ordinary one a month later — which is
  // the whole bet the app makes. It earns its place because the forenoon has no hinge otherwise:
  // between standing up from Fajr and sitting down to Dhuhr there is no deed with a finish for
  // anything to hang on, and that is the longest such stretch in the waking day.
  duha: { label: 'Prayed Ḍuḥā', stackName: 'Ḍuḥā', icon: 'duha', band: 'morning' },
  dhuhr: { label: 'Prayed Dhuhr', stackName: 'Dhuhr', icon: 'dhuhr', band: 'midday' },
  asr: { label: 'Prayed ʿAṣr', stackName: 'ʿAṣr', icon: 'asr', band: 'midday' },
  maghrib: { label: 'Prayed Maghrib', stackName: 'Maghrib', icon: 'maghrib', band: 'evening' },
  isha: { label: 'Prayed ʿIshāʾ', stackName: 'ʿIshāʾ', icon: 'isha', band: 'night' },
  // Anchored to the prayer, not to the weekday: "it became Friday" is a date, "I prayed
  // Jumuʿah" is a deed you can hang something on.
  jumuah: { label: 'Prayed Jumuʿah', stackName: 'Jumuʿah', icon: 'jumuah', band: null },
} satisfies Record<string, MomentDef>;

export type MomentKey = keyof typeof MOMENT_DEFS;

/** The registry, re-typed so every lookup carries the full (optional-field) shape. */
export const MOMENTS: Record<MomentKey, MomentDef> = MOMENT_DEFS;

/**
 * The picker's layout: one labeled group per block, in day order within each.
 *
 * Ordered by how well the cue actually holds, strongest first — the prayers (fixed, daily,
 * already automatic), then the other deeds of the day, then the bare times of day last and
 * named for what they are. Leading with "TIME OF DAY", as this list used to, put the one
 * option that cannot remind you of anything at the top of the grid.
 *
 * The titles name the *thing*, not the relation ("PRAYERS", not "AFTER A PRAYER"): the relation
 * is stated once by the picker's own lede, and repeating "after" over every group put the same
 * word at the head of the screen three times over — the same reason the stack names dropped it.
 */
export const MOMENT_GROUPS: { key: string; title: string; moments: MomentKey[] }[] = [
  { key: 'prayers', title: 'Prayers', moments: ['fajr', 'duha', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah'] },
  { key: 'life', title: 'Something you do', moments: ['waking-up', 'before-dawn', 'bedtime'] },
  { key: 'sky', title: 'Just a time: weakest cue', moments: ['morning', 'midday', 'evening', 'night'] },
];

/** Narrow the DB's `text` column (or any unknown string) to a MomentKey. `hasOwn`, not `in`:
 *  `in` also matches inherited prototype keys ('toString' would pass and read undefined
 *  label/icon off Object.prototype downstream). */
export function asMoment(value: string | null | undefined): MomentKey | null {
  return value != null && Object.hasOwn(MOMENTS, value) ? (value as MomentKey) : null;
}

/** A stack row's effective moment: the stored `moment`, falling back to the legacy
 *  `day_part` (whose values are themselves sky-moment keys). */
export function momentOf(stack: { moment?: string | null; day_part: string | null }): MomentKey | null {
  return asMoment(stack.moment) ?? asDayPart(stack.day_part);
}

/** A moment's day-cycle band (null for weekday moments and no-moment). */
export function momentBand(moment: MomentKey | null): DayPart | null {
  return moment ? MOMENTS[moment].band : null;
}

const BAND_RANK: Record<DayPart, number> = { morning: 0, midday: 1, evening: 2, night: 3 };

/**
 * Where a newly-born anchored stack should land in the list: right AFTER the last existing
 * anchored block of an earlier-or-same band, else BEFORE the first later-band block, else
 * nowhere special (null → caller keeps its default, the end of the list). Respects whatever
 * order the user keeps their existing stacks in — the newcomer slots into the day sequence,
 * nothing else moves, and a drag afterward still re-sorts freely. Returns a top-level unit
 * placement (`stack:<id>` keys) for {@link orderAfterHabitMove}.
 */
export function dayOrderPlacement(
  habits: readonly { position: number; stack_id: string | null }[],
  stacks: readonly { id: string; moment?: string | null; day_part: string | null }[],
  moment: MomentKey | null,
): { type: 'after-unit'; key: string } | { type: 'before-unit'; key: string } | null {
  const band = momentBand(moment);
  if (!band) return null;
  const bandById = new Map(stacks.map((s) => [s.id, momentBand(momentOf(s))]));
  // Anchored blocks in list order (first-occurrence order of stack ids over position-sorted habits).
  const seen = new Set<string>();
  const blocks: { stackId: string; rank: number }[] = [];
  for (const h of [...habits].sort((a, b) => a.position - b.position)) {
    if (!h.stack_id || seen.has(h.stack_id)) continue;
    seen.add(h.stack_id);
    const blockBand = bandById.get(h.stack_id);
    if (blockBand) blocks.push({ stackId: h.stack_id, rank: BAND_RANK[blockBand] });
  }
  const myRank = BAND_RANK[band];
  let lastEarlier: { stackId: string; rank: number } | null = null;
  for (const b of blocks) if (b.rank <= myRank) lastEarlier = b;
  if (lastEarlier) return { type: 'after-unit', key: `stack:${lastEarlier.stackId}` };
  const firstLater = blocks.find((b) => b.rank > myRank);
  if (firstLater) return { type: 'before-unit', key: `stack:${firstLater.stackId}` };
  return null;
}
