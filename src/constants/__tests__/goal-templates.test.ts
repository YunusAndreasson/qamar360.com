import { describe, expect, it } from '@jest/globals';

import { HORIZON_SPANS } from '@/constants/goal-templates';

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
