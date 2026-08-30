import { describe, expect, it } from '@jest/globals';

import { parsePersonalizedInsight } from '@/lib/personalized-insights';

describe('parsePersonalizedInsight', () => {
  it('accepts the persisted, paragraph-shaped API response', () => {
    expect(
      parsePersonalizedInsight({
        insight: {
          reading_id: '1448-3-22',
          paragraphs: ['A specific observation.', 'A gentle connection.', 'An encouraging frame.'],
          next_step: 'Keep one act at the same anchor for the next seven days.',
          evidence: null,
          used_notes: true,
          generated_at: '2026-08-30T00:00:00Z',
        },
      }),
    ).not.toBeNull();
  });

  it('rejects a single dumped block', () => {
    expect(
      parsePersonalizedInsight({
        insight: {
          reading_id: '1448-3-22',
          paragraphs: ['Everything in one block.'],
          next_step: 'Try again.',
          evidence: null,
          used_notes: false,
          generated_at: '2026-08-30T00:00:00Z',
        },
      }),
    ).toBeNull();
  });
});
