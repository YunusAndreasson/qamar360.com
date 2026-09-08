import { describe, expect, it } from '@jest/globals';

import { GOAL_TEMPLATES, HORIZON_SPANS, defaultCadenceFor } from '@/constants/goal-templates';

describe('HORIZON_SPANS', () => {
  /**
   * A span stores the months lying AHEAD, so it is always one short of the span it is labelled
   * with — the month you are in counts toward the goal. One entry was briefly 247, the lunar
   * months in twenty *solar* years, which quietly made that one option mean something different
   * from the other five and put its by-when eight months past its own label. Reading the label
   * back is the assertion that catches it: a number checked against a rule can drift with the
   * rule, a number checked against the words the user reads cannot.
   */
  it('stores exactly the span its label promises, counting the month you are in', () => {
    for (const span of HORIZON_SPANS) {
      const match = /^(\d+) (months|years?)$/.exec(span.label);
      expect(match).not.toBeNull();
      const n = Number(match![1]);
      const labelled = match![2]!.startsWith('year') ? n * 12 : n;
      // `months` is how many months lie AHEAD; the current one counts too, hence + 1.
      expect(span.months + 1).toBe(labelled);
    }
  });

  it('is offered narrowest first, with no duplicates', () => {
    const months = HORIZON_SPANS.map((s) => s.months);
    expect(months).toEqual([...months].sort((a, b) => a - b));
    expect(new Set(months).size).toBe(months.length);
  });
});

describe('GOAL_TEMPLATES', () => {
  /** A template that measures something must have exactly one act that moves the number, or the
   *  goal can offer no per-day target at all ({@link import('@/lib/goals').GoalReading.dailyTarget}
   *  returns null for two contributors, deliberately). */
  it('gives every measuring template exactly one contributing act', () => {
    for (const template of GOAL_TEMPLATES.filter((t) => t.acts.length > 0)) {
      expect(template.acts.filter((a) => a.contributes)).toHaveLength(1);
    }
  });

  /** The contributing act carries the goal's own unit, so the number the goal writes onto it and
   *  the number the goal counts are in the same currency. */
  it('counts the contributing act in the goal’s unit', () => {
    for (const template of GOAL_TEMPLATES.filter((t) => t.acts.length > 0)) {
      const driver = template.acts.find((a) => a.contributes);
      expect(driver?.targetUnit).toBe(template.unit);
      expect(driver?.targetCount).toBeGreaterThan(0);
    }
  });

  /** Acts are named in the past tense everywhere in this app — the day's list is read as a record
   *  of what was done (`20260725220000_rename_habits_past_tense.sql`). */
  it('names acts in the past tense', () => {
    for (const template of GOAL_TEMPLATES) {
      for (const act of template.acts) expect(act.name).toMatch(/^(Memorised|Revised|Learned|Read|Prayed|Said|Took|Walked)\b/);
    }
  });

  it('has unique ids and unique act names within a template', () => {
    expect(new Set(GOAL_TEMPLATES.map((t) => t.id)).size).toBe(GOAL_TEMPLATES.length);
    for (const template of GOAL_TEMPLATES) {
      // The composer pairs created habits back to template acts BY NAME, so a repeat inside one
      // template would attach the wrong `contributes` flag.
      const names = template.acts.map((a) => a.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  /**
   * The composer opens on this, and it is the difference between a goal that lands on Today and
   * one that lands nowhere. An act-driven goal already reports every day, so its check-in is there
   * to RE-BASE the sum rather than to collect the number again — four times a month, on the same
   * grid the readings publish on. A goal no act produces has nothing else reporting it at all.
   */
  it('starts an act-driven goal on the moon quarters and a bare measure weekly', () => {
    for (const template of GOAL_TEMPLATES) {
      expect(defaultCadenceFor(template)).toBe(template.acts.some((a) => a.contributes) ? 'quarter' : 'weekly');
    }
    expect(defaultCadenceFor(GOAL_TEMPLATES.find((t) => t.id === 'hifz')!)).toBe('quarter');
    expect(defaultCadenceFor(GOAL_TEMPLATES.find((t) => t.id === 'blank')!)).toBe('weekly');
  });
});
