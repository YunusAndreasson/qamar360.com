import type { IconName } from '@/constants/icons';
import { asDayPart, type DayPart } from '@/lib/sun';

/**
 * Moments — the occasions a stack can be anchored to. The user picks ONE thing (icon + label
 * together, always optional) and everything else derives from it:
 *
 *  - **identity**: the stack's leading emblem is the moment's icon, worn always — so two
 *    night stacks are never two moons ("Going to bed" wears the zzz-moon, "ʿIshāʾ" the
 *    starry one).
 *  - **the cycle**: each moment maps to a {@link DayPart} band underneath; the current
 *    band's first open stack lights up ("now" is said by light alone). Friday moments
 *    (Jumuʿah) light by weekday instead.
 *  - **the caption**: only SKY moments show "until HH:MM" (the band's closing time — a sky
 *    fact). Prayer moments never carry a clock: the app's standing rule is that it never
 *    publishes a time to pray by (its location is timezone-derived, ±20 min — fine for sky
 *    gradients, disqualifying for prayer times).
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
   * ("After Fajr"), which is not the same sentence as the deed you anchored to ("Prayed Fajr").
   */
  stackName: string;
  /** Emblem in the {@link Icons} registry — the stack's identity glyph. */
  icon: IconName;
  /** The day-cycle band the moment lives in; null only for weekday moments. */
  band: DayPart | null;
  /** Lights all of Friday (weekday-scoped, not hour-scoped). */
  friday?: boolean;
  /** Show the band's "until HH:MM" closing time while lit — sky moments only. */
  until?: boolean;
};

const MOMENT_DEFS = {
  // ── Sky (the four day parts; keys == DayPart) ───────────────────────────
  // No deed to name: a band opening is something the sun does, not something you did. Kept
  // because they carry the day's light and the legacy `day_part` rows, but filed last.
  morning: { label: 'Morning', stackName: 'Morning', icon: 'sunrise', band: 'morning', until: true },
  midday: { label: 'Midday', stackName: 'Midday', icon: 'sun', band: 'midday', until: true },
  evening: { label: 'Evening', stackName: 'Evening', icon: 'sunset', band: 'evening', until: true },
  night: { label: 'Night', stackName: 'Night', icon: 'moon', band: 'night', until: true },
  // ── Life moments — each one an act with an unmistakable finish ───────────
  'waking-up': { label: 'Woke up', stackName: 'After waking', icon: 'wake', band: 'morning', until: true },
  'before-dawn': {
    label: 'Woke in the night',
    stackName: 'After rising at night',
    icon: 'preDawn',
    band: 'night',
    until: true,
  },
  bedtime: { label: 'Got into bed', stackName: 'After getting into bed', icon: 'bedtime', band: 'night', until: true },
  // ── Prayers (sun-position icons — their windows are solar by definition) ─
  // The strongest cues in the app: a prayer has a definite end, happens daily, and is already
  // automatic. The anchor is *having prayed it*, never the hour it falls in.
  fajr: { label: 'Prayed Fajr', stackName: 'After Fajr', icon: 'fajr', band: 'morning' },
  dhuhr: { label: 'Prayed Dhuhr', stackName: 'After Dhuhr', icon: 'dhuhr', band: 'midday' },
  asr: { label: 'Prayed ʿAṣr', stackName: 'After ʿAṣr', icon: 'asr', band: 'midday' },
  maghrib: { label: 'Prayed Maghrib', stackName: 'After Maghrib', icon: 'maghrib', band: 'evening' },
  isha: { label: 'Prayed ʿIshāʾ', stackName: 'After ʿIshāʾ', icon: 'isha', band: 'night' },
  // Anchored to the prayer, not to the weekday: "it became Friday" is a date, "I prayed
  // Jumuʿah" is a deed you can hang something on.
  jumuah: { label: 'Prayed Jumuʿah', stackName: 'After Jumuʿah', icon: 'jumuah', band: null, friday: true },
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
 */
export const MOMENT_GROUPS: { key: string; title: string; moments: MomentKey[] }[] = [
  { key: 'prayers', title: 'AFTER A PRAYER', moments: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah'] },
  { key: 'life', title: 'AFTER SOMETHING YOU DID', moments: ['waking-up', 'before-dawn', 'bedtime'] },
  { key: 'sky', title: 'JUST A TIME — WEAKEST CUE', moments: ['morning', 'midday', 'evening', 'night'] },
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
