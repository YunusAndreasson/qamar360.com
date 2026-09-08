import type { CadenceKey } from '@/lib/check-ins';
import type { MomentKey } from '@/lib/moments';

/**
 * The ready-made goals.
 *
 * A blank form is the wrong way into a long goal, and not as a matter of taste: goal-setting
 * theory turns on specificity, and the two things a person is least able to specify about a
 * twenty-year undertaking are the number and the practice. Someone who knows they want to
 * memorise the Qurʾān does not know that it is 9,060 lines, and — the part that actually decides
 * whether it happens — does not know that the new material is the easy half.
 *
 * So a template carries three things the composer could not ask for: the measure, the acts that
 * produce it, and the one thing plans of this kind get wrong, said out loud before the goal is
 * saved. It is a starting point in the same way {@link import('./curated-stacks').CURATED_STACKS}
 * is: once created, the goal and its acts are ordinary rows the user edits, prunes and re-anchors.
 *
 * Act names are past tense, like every other act in the app ("Memorised the new lines", not
 * "Memorise"), because the day's list is read as a record of what was done.
 */

/** One act a template creates, in the stack's own sequence. */
type GoalTemplateAct = {
  name: string;
  /**
   * Whether it moves the measure. The revision acts are `false`: they are the reason the goal
   * survives, and counting them would report a ḥāfiẓ finishing years early.
   */
  contributes: boolean;
  /** A starting per-day target. The goal re-derives this from the horizon at each new moon. */
  targetCount: number | null;
  targetUnit: string | null;
  /** Weekday indices, 0=Sunday. Daily for all of these — a long goal is a daily practice. */
  scheduleDays: number[];
};

export type GoalTemplate = {
  id: string;
  /** The row in the picker, and the goal's default title. */
  title: string;
  /** One line under the title, saying what the goal is. */
  blurb: string;
  /** What is counted, printed beside every figure. */
  unit: string;
  /** The whole of it. `null` for the blank template, where the user names their own. */
  targetValue: number | null;
  /** The step between subgoals — a juzʾ, five hundred words. */
  milestoneStep: number | null;
  /** The anchor the acts are proposed under; the composer lets it be changed. */
  moment: MomentKey;
  acts: GoalTemplateAct[];
  /**
   * What this kind of goal usually gets wrong, shown in the composer before it is saved. Null
   * where there is nothing specific to say — better silence than a filled slot.
   */
  caution: string | null;
};

/**
 * One juzʾ in lines: 604 pages of the Madanī muṣḥaf at fifteen lines a page is 9,060, and thirty
 * juzʾ divides it into steps of about 302. Lines rather than pages because a line is what a day
 * of sabaq is actually counted in.
 */
const JUZ_IN_LINES = 302;

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    id: 'hifz',
    title: 'Ḥifẓ of the Qurʾān',
    blurb: 'The whole muṣḥaf, counted in lines and held by daily revision.',
    unit: 'lines',
    targetValue: JUZ_IN_LINES * 30,
    milestoneStep: JUZ_IN_LINES,
    moment: 'fajr',
    // Sabaq, sabqī and manzil: the new portion, the last week re-read, and an older juzʾ. The
    // order is the one the teachers use — revision first, while the mind is fresh, and the new
    // lines last.
    acts: [
      { name: 'Revised the last seven days', contributes: false, targetCount: null, targetUnit: null, scheduleDays: [0, 1, 2, 3, 4, 5, 6] },
      { name: 'Revised an older juzʾ', contributes: false, targetCount: null, targetUnit: null, scheduleDays: [0, 1, 2, 3, 4, 5, 6] },
      { name: 'Memorised the new lines', contributes: true, targetCount: 4, targetUnit: 'lines', scheduleDays: [0, 1, 2, 3, 4, 5, 6] },
    ],
    caution:
      'Over twenty years the new lines come to about one a day. What decides this goal is the revision: near the end you are re-reading close to a juzʾ daily just to hold what you have. Both revision acts are here for that, and neither adds a line to the count.',
  },
  {
    id: 'vocabulary',
    title: '5,000 words of Arabic',
    blurb: 'Roughly where unvowelled text stops being a translation exercise.',
    unit: 'words',
    targetValue: 5000,
    milestoneStep: 500,
    moment: 'isha',
    acts: [
      { name: 'Revised the deck', contributes: false, targetCount: null, targetUnit: null, scheduleDays: [0, 1, 2, 3, 4, 5, 6] },
      { name: 'Learned new words', contributes: true, targetCount: 15, targetUnit: 'words', scheduleDays: [0, 1, 2, 3, 4, 5, 6] },
    ],
    caution: 'New words are the cheap half. Words meet twice and are gone; the deck is what keeps them.',
  },
  {
    id: 'blank',
    title: 'Something else',
    blurb: 'Your own measure, over acts you already keep.',
    unit: '',
    targetValue: null,
    milestoneStep: null,
    moment: 'fajr',
    acts: [],
    caution: null,
  },
];

/**
 * The spans the horizon is chosen from, in **lunar** months, and every one of them is `12N − 1`:
 * the current month counts toward the goal, so "1 year" is this month plus eleven more. A goal is
 * set in years rather than on a date wheel — twenty years of one is unusable — and this app counts
 * in lunar months anyway, so the label's "years" are lunar years throughout. (20 years was briefly
 * 247, the count of lunar months in twenty *solar* years, which made that one span mean something
 * different from the other five and put the by-when eight months past its own label.)
 */
export const HORIZON_SPANS: { months: number; label: string }[] = [
  { months: 5, label: '6 months' },
  { months: 11, label: '1 year' },
  { months: 35, label: '3 years' },
  { months: 59, label: '5 years' },
  { months: 119, label: '10 years' },
  { months: 239, label: '20 years' },
];

/**
 * The cadence a template's goal starts asking on.
 *
 * A template that brings contributing acts already reports every day — the tick on "Memorised the
 * new lines" is the measurement. Its check-in is not there to collect the number a second time but
 * to **re-base** the sum against where the muṣḥaf actually stands, which is a thing worth doing
 * four times a month and absurd to do four times a week. So it lands on the moon quarters, the
 * same grid the readings publish on.
 *
 * A goal no act produces has nothing else reporting it: the check-in IS the measurement, and a
 * week is the shortest span over which a weight or a page count says anything that is not noise.
 */
export function defaultCadenceFor(template: GoalTemplate): CadenceKey {
  return template.acts.some((act) => act.contributes) ? 'quarter' : 'weekly';
}
