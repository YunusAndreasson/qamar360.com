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
 * below is mostly just those deeds with a short sequence hung on each. Every name here is
 * therefore an *after*, matching the past-tense voice the acts themselves are named in.
 *
 * Ḍuḥā is the one exception: it is a cue the user has to establish rather than one they already
 * have. It is here because the forenoon is the longest stretch of the waking day with no deed in
 * it to hang anything on, so the alternative was not a weaker anchor — it was no stack at all.
 *
 * The groups are plain nouns, in the order of the day, and nothing more: the library is scanned
 * for a moment you recognise ("Fajr", "Getting into bed"), so a heading only has to say which
 * shelf that moment is on. They used to be figures of speech ("The hinges of the day", "The
 * prayer you choose") that each needed reading twice.
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
  /** The anchor: the stack wears this moment's emblem. */
  moment: MomentKey;
  /** The acts, in the order they are performed. */
  acts: CuratedAct[];
};

/** Fridays only — for acts a weekly stack borrows from an otherwise-daily preset. */
const FRIDAY = [5];

export const CURATED_GROUPS: { key: string; title: string; stacks: CuratedStack[] }[] = [
  {
    key: 'prayers',
    title: 'Prayers',
    stacks: [
      {
        id: 'after-fajr',
        name: 'Fajr',
        moment: 'fajr',
        acts: [
          { presetId: 'sunnah-before-fajr' },
          { presetId: 'fajr-on-time' },
          { presetId: 'morning-adhkar' },
          { presetId: 'quran-daily-page' },
          { presetId: 'stay-up-after-fajr' },
        ],
      },
      {
        id: 'after-duha',
        name: 'Ḍuḥā',
        moment: 'duha',
        // The only stack here whose anchor is not already automatic — see the note on the `duha`
        // moment. It is also the only one whose first act *is* the anchor rather than a refinement
        // of it: the five carry "prayed it on time", because praying at all was never in question,
        // and here it is. So it is deliberately short, and the forenoon it opens is the emptiest
        // stretch of the day to grow into.
        acts: [
          { presetId: 'duha' },
          // The rest of the ḥadīth the prayer comes from: a charity owed by every joint each
          // morning, of which ṣadaqah and a good word are named outright, and two rakʿahs of Ḍuḥā
          // suffice for all of it (Muslim 720). The stack is that ḥadīth in its own order.
          { presetId: 'sadaqah-daily' },
          { presetId: 'good-word' },
          // And the forenoon's own work: the hours students have always kept for new ḥifẓ, in the
          // one stretch of the day nothing else has claimed yet.
          { presetId: 'quran-sabaq' },
        ],
      },
      {
        id: 'after-dhuhr',
        name: 'Dhuhr',
        moment: 'dhuhr',
        acts: [
          { presetId: 'sunnah-before-dhuhr' },
          { presetId: 'dhuhr-on-time' },
          { presetId: 'sunnah-after-dhuhr' },
          { presetId: 'qaylulah' },
        ],
      },
      {
        id: 'after-asr',
        name: 'ʿAṣr',
        moment: 'asr',
        acts: [
          { presetId: 'sunnah-before-asr' },
          { presetId: 'asr-on-time' },
          { presetId: 'tasbih-after-salah' },
          { presetId: 'daily-walk' },
        ],
      },
      {
        id: 'after-maghrib',
        name: 'Maghrib',
        moment: 'maghrib',
        acts: [
          { presetId: 'maghrib-on-time' },
          { presetId: 'sunnah-after-maghrib' },
          { presetId: 'evening-adhkar' },
          { presetId: 'family-time' },
        ],
      },
      {
        id: 'after-isha',
        name: 'ʿIshāʾ',
        moment: 'isha',
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
    key: 'waking-and-sleep',
    title: 'Waking and sleep',
    stacks: [
      {
        id: 'after-waking',
        name: 'Waking up',
        moment: 'waking-up',
        acts: [
          { presetId: 'wipe-face-on-waking' },
          { presetId: 'dua-on-waking' },
          { presetId: 'miswak' },
          { presetId: 'hydrate-water' },
        ],
      },
      {
        id: 'after-waking-body',
        name: 'Waking up, for the body',
        // Re-anchored off the bare `morning` band: "it became morning" is the one cue in this
        // file that never had a moment you could notice. Every act here already follows getting
        // up, so it hangs on getting up. Shares the anchor with 'after-waking' on purpose —
        // they are two different sequences off the same reliable deed, and a user may keep both.
        moment: 'waking-up',
        acts: [
          { presetId: 'morning-daylight' },
          { presetId: 'protein-morning' },
          { presetId: 'vitamin-d' },
          { presetId: 'exercise-daily' },
        ],
      },
      {
        id: 'after-getting-into-bed',
        name: 'Getting into bed',
        moment: 'bedtime',
        acts: [
          { presetId: 'screens-away' },
          { presetId: 'sleep-on-wudu' },
          { presetId: 'surah-al-mulk' },
          { presetId: 'three-quls-sleep' },
          { presetId: 'sleeping-adhkar' },
        ],
      },
      {
        id: 'after-rising-at-night',
        name: 'Rising at night',
        moment: 'before-dawn',
        acts: [{ presetId: 'tahajjud' }, { presetId: 'istighfar-100' }, { presetId: 'quran-murajaah' }],
      },
    ],
  },
  {
    key: 'week',
    title: 'Fridays',
    stacks: [
      {
        id: 'after-jumuah',
        name: 'Jumuʿah',
        // Anchored to the prayer, not the weekday. "It is Friday" is a fact about the calendar
        // that arrives while you are asleep and never announces itself again; standing up from
        // Jumuʿah is a deed with a finish, which is the only kind of thing a stack can hang on.
        moment: 'jumuah',
        acts: [
          { presetId: 'surah-al-kahf-friday' },
          { presetId: 'salawat', schedule: FRIDAY },
          { presetId: 'dua-for-a-brother', schedule: FRIDAY },
        ],
      },
    ],
  },
];

/** Every curated stack, flat and in library order. */
export const CURATED_STACKS: CuratedStack[] = CURATED_GROUPS.flatMap((g) => g.stacks);
