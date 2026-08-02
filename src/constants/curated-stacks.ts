import type { MomentKey } from '@/lib/moments';

/**
 * Ready-made stacks, each anchored to a moment the day already contains.
 *
 * The whole app is built on one finding: a new act attached to an existing, already-automatic
 * cue survives, and one floating loose in the day does not. The cue has to be a **deed with a
 * definite finish** — "after I pray Maghrib", "after I get into bed" — never a reading off the
 * clock or the calendar. "It became evening" and "it became Friday" are things that happen to
 * you; they cannot prompt anything, because there is no moment at which you notice them.
 *
 * Muslims carry an unusually reliable set of real cues — five prayers at fixed points of the
 * sun, the Friday prayer, plus waking, rising in the night, and lying down — so the library
 * below is simply those deeds with a short sequence hung on each. Every name here is therefore
 * an *after*, matching the past-tense voice the acts themselves are named in.
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
        id: 'after-waking',
        name: 'After waking',
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
        id: 'after-rising-at-night',
        name: 'After rising at night',
        moment: 'before-dawn',
        blurb: 'Getting up is the hard part, and you have already done it — hang the rest on that.',
        acts: [{ presetId: 'tahajjud' }, { presetId: 'istighfar-100' }, { presetId: 'quran-murajaah' }],
      },
      {
        id: 'after-getting-into-bed',
        name: 'After getting into bed',
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
        blurb: 'You are already up and on the mat, and nothing has claimed the day yet.',
        acts: [
          { presetId: 'sunnah-before-fajr' },
          { presetId: 'fajr-on-time' },
          { presetId: 'morning-adhkar' },
          { presetId: 'quran-daily-page' },
          { presetId: 'stay-up-after-fajr' },
        ],
      },
      {
        id: 'after-dhuhr',
        name: 'After Dhuhr',
        moment: 'dhuhr',
        blurb: 'The prayer has already broken the working day open — use the break it made.',
        acts: [
          { presetId: 'sunnah-before-dhuhr' },
          { presetId: 'dhuhr-on-time' },
          { presetId: 'sunnah-after-dhuhr' },
          { presetId: 'qaylulah' },
        ],
      },
      {
        id: 'after-asr',
        name: 'After ʿAṣr',
        moment: 'asr',
        blurb: 'You have just stood up from prayer — the body is already moving, so keep it moving.',
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
        blurb: 'You have just prayed and the household is together — attach what belongs to people.',
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
    title: 'THE WEEKLY PRAYER',
    stacks: [
      {
        id: 'after-jumuah',
        name: 'After Jumuʿah',
        moment: 'jumuah',
        // Anchored to the prayer, not the weekday. "It is Friday" is a fact about the calendar
        // that arrives while you are asleep and never announces itself again; standing up from
        // Jumuʿah is a deed with a finish, which is the only kind of thing a stack can hang on.
        blurb: 'The one prayer you leave the house for — and the clearest finish line in the week.',
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
        id: 'after-waking-body',
        name: 'After waking, for the body',
        // Re-anchored off the bare `morning` band: "it became morning" is the one cue in this
        // file that never had a moment you could notice. Every act here already follows getting
        // up, so it hangs on getting up. Shares the anchor with 'after-waking' on purpose —
        // they are two different sequences off the same reliable deed, and a user may keep both.
        moment: 'waking-up',
        blurb: 'You are already up and moving; hang the body’s work on that, not on a clock.',
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
