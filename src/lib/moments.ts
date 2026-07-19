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
  /** Picker + accessibility label, house transliteration style. */
  label: string;
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
  morning: { label: 'Morning', icon: 'sunrise', band: 'morning', until: true },
  midday: { label: 'Midday', icon: 'sun', band: 'midday', until: true },
  evening: { label: 'Evening', icon: 'sunset', band: 'evening', until: true },
  night: { label: 'Night', icon: 'moon', band: 'night', until: true },
  // ── Life moments ────────────────────────────────────────────────────────
  'waking-up': { label: 'Waking up', icon: 'wake', band: 'morning', until: true },
  'before-dawn': { label: 'Before dawn', icon: 'preDawn', band: 'night', until: true },
  bedtime: { label: 'Bedtime', icon: 'bedtime', band: 'night', until: true },
  // ── Prayers (sun-position icons — their windows are solar by definition) ─
  fajr: { label: 'Fajr', icon: 'fajr', band: 'morning' },
  dhuhr: { label: 'Dhuhr', icon: 'dhuhr', band: 'midday' },
  asr: { label: 'ʿAṣr', icon: 'asr', band: 'midday' },
  maghrib: { label: 'Maghrib', icon: 'maghrib', band: 'evening' },
  isha: { label: 'ʿIshāʾ', icon: 'isha', band: 'night' },
  jumuah: { label: 'Jumuʿah', icon: 'jumuah', band: null, friday: true },
} satisfies Record<string, MomentDef>;

export type MomentKey = keyof typeof MOMENT_DEFS;

/** The registry, re-typed so every lookup carries the full (optional-field) shape. */
export const MOMENTS: Record<MomentKey, MomentDef> = MOMENT_DEFS;

/** The picker's layout: one labeled group per block, in day order within each. */
export const MOMENT_GROUPS: { key: string; title: string; moments: MomentKey[] }[] = [
  { key: 'sky', title: 'TIME OF DAY', moments: ['morning', 'midday', 'evening', 'night'] },
  { key: 'life', title: 'MOMENTS', moments: ['waking-up', 'before-dawn', 'bedtime'] },
  { key: 'prayers', title: 'PRAYERS', moments: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah'] },
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
