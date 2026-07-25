import type { MomentKey } from '@/lib/moments';

/**
 * Ready-made stacks, each anchored to a moment the day already contains.
 *
 * The whole app is built on one finding: a new act attached to an existing, already-automatic
 * cue survives, and one floating loose in the day does not. Muslims carry an unusually reliable
 * set of such cues — five prayers at fixed points of the sun, plus waking, sleeping, the hour
 * before dawn, and Friday — so the library below is simply those cues with a short sequence
 * hung on each.
 *
 * Every act is a preset that already exists in {@link SUNNAH_PRESETS}; this file only names ids
 * and their order. A curated stack is a *starting point* — once added it is an ordinary stack the
 * user reorders, prunes and grows.
 *
 * Two invariants, both enforced by `curated-stacks.test.ts`:
 *  - every `presetId` resolves in the catalog (a typo would silently shrink a stack);
 *  - **no preset appears in two curated stacks** — the planner skips presets the user already
 *    owns, so a shared act would silently vanish from whichever stack was added second.
 */

/** One act in a curated stack. `schedule` overrides the preset's own default (weekly stacks). */
type CuratedAct = {
  presetId: string;
  /** Weekday indices (0=Sun … 6=Sat) replacing the preset's `defaultSchedule`. */
  schedule?: number[];
};

export type CuratedStack = {
  /** Stable key, e.g. 'after-fajr'. */
  id: string;
  /** The stack name as created — also the dedupe key against the user's existing stacks. */
  name: string;
  /** The anchor: the stack wears this moment's emblem and lights when it arrives. */
  moment: MomentKey;
  /** One line on why this cue holds — shown in the library, not stored on the stack. */
  blurb: string;
  /** The acts, in the order they are performed. */
  acts: CuratedAct[];
};

/** Fridays only — for acts a weekly stack borrows from an otherwise-daily preset. */
const FRIDAY = [5];

export const CURATED_GROUPS: { key: string; title: string; stacks: CuratedStack[] }[] = [
  {
    key: 'hinges',
    title: 'THE HINGES OF THE DAY',
    stacks: [
      {
        id: 'waking-up',
        name: 'Waking up',
        moment: 'waking-up',
        blurb: 'Your eyes open in the same place every day — the most dependable cue you own.',
        acts: [
          { presetId: 'wipe-face-on-waking' },
          { presetId: 'dua-on-waking' },
          { presetId: 'miswak' },
          { presetId: 'hydrate-water' },
        ],
      },
      {
        id: 'before-dawn',
        name: 'Before dawn',
        moment: 'before-dawn',
        blurb: 'The quietest hour, and the one nobody else asks anything of.',
        acts: [{ presetId: 'tahajjud' }, { presetId: 'istighfar-100' }, { presetId: 'quran-murajaah' }],
      },
      {
        id: 'before-sleep',
        name: 'Before sleep',
        moment: 'bedtime',
        blurb: 'Lying down is the one thing you never skip — so it can carry the rest.',
        acts: [
          { presetId: 'screens-away' },
          { presetId: 'sleep-on-wudu' },
          { presetId: 'surah-al-mulk' },
          { presetId: 'three-quls-sleep' },
          { presetId: 'sleeping-adhkar' },
        ],
      },
    ],
  },
  {
    key: 'prayers',
    title: 'THE FIVE PRAYERS',
    stacks: [
      {
        id: 'after-fajr',
        name: 'After Fajr',
        moment: 'fajr',
        blurb: 'The day is already awake and nothing has claimed it yet.',
        acts: [
          { presetId: 'sunnah-before-fajr' },
          { presetId: 'fajr-on-time' },
          { presetId: 'morning-adhkar' },
          { presetId: 'quran-daily-page' },
          { presetId: 'stay-up-after-fajr' },
        ],
      },
      {
        id: 'around-dhuhr',
        name: 'Around Dhuhr',
        moment: 'dhuhr',
        blurb: 'A seam in the middle of the working day — a place to set it down.',
        acts: [
          { presetId: 'sunnah-before-dhuhr' },
          { presetId: 'dhuhr-on-time' },
          { presetId: 'sunnah-after-dhuhr' },
          { presetId: 'qaylulah' },
        ],
      },
      {
        id: 'around-asr',
        name: 'Around ʿAṣr',
        moment: 'asr',
        blurb: 'The afternoon turn — late enough to move, early enough to still matter.',
        acts: [
          { presetId: 'sunnah-before-asr' },
          { presetId: 'asr-on-time' },
          { presetId: 'tasbih-after-salah' },
          { presetId: 'daily-walk' },
        ],
      },
      {
        id: 'after-maghrib',
        name: 'After Maghrib',
        moment: 'maghrib',
        blurb: 'The day closes and the household gathers — attach what belongs to people.',
        acts: [
          { presetId: 'maghrib-on-time' },
          { presetId: 'sunnah-after-maghrib' },
          { presetId: 'evening-adhkar' },
          { presetId: 'family-time' },
        ],
      },
      {
        id: 'after-isha',
        name: 'After ʿIshāʾ',
        moment: 'isha',
        blurb: 'The last prayer already ends your day — let it end it well.',
        acts: [
          { presetId: 'isha-on-time' },
          { presetId: 'sunnah-after-isha' },
          { presetId: 'witr' },
          { presetId: 'sleep-early' },
        ],
      },
    ],
  },
  {
    key: 'week',
    title: 'THE WEEK',
    stacks: [
      {
        id: 'friday',
        name: 'Friday',
        moment: 'jumuah',
        blurb: 'One day a week that announces itself — the easiest anchor of all to remember.',
        acts: [
          { presetId: 'surah-al-kahf-friday' },
          { presetId: 'salawat', schedule: FRIDAY },
          { presetId: 'dua-for-a-brother', schedule: FRIDAY },
        ],
      },
    ],
  },
  {
    key: 'body',
    title: 'BODY & MIND',
    stacks: [
      {
        id: 'morning-body',
        name: 'Morning body',
        moment: 'morning',
        blurb: 'The body keeps the rest of it possible; morning is when it is cheapest to serve.',
        acts: [
          { presetId: 'morning-daylight' },
          { presetId: 'protein-morning' },
          { presetId: 'vitamin-d' },
          { presetId: 'exercise-daily' },
        ],
      },
    ],
  },
];

/** Every curated stack, flat and in library order. */
export const CURATED_STACKS: CuratedStack[] = CURATED_GROUPS.flatMap((g) => g.stacks);
