import { describe, expect, it } from '@jest/globals';

import { parseGoalNumber } from '@/lib/goal-form';

describe('goal amounts', () => {
  it.each([['0', 0], ['12', 12], [' 82.4 ', 82.4], ['82,4', 82.4], ['.5', 0.5]])(
    'accepts %s as %s', (input, expected) => expect(parseGoalNumber(input)).toBe(expected),
  );
  it.each(['', ' ', '-12', '12 books', '1.2.3', '1,2,3', 'Infinity', '1e3', '9'.repeat(400)])(
    'rejects %s instead of silently changing its value', (input) => expect(parseGoalNumber(input)).toBeNull(),
  );
});
