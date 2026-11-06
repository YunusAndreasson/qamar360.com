import { describe, expect, it } from '@jest/globals';

import { recoveryFor, REPEAT_FAILURE_MS } from '@/lib/error-recovery';

describe('recoveryFor', () => {
  it('offers to try again the first time the tree throws', () => {
    expect(recoveryFor(null, 1_000_000)).toBe('retry');
  });

  // Trying again re-renders the same tree, so a throw right after it is the same throw. Offering
  // "Try again" a second time leaves the user pressing a button that cannot work.
  it('offers a restart when the tree throws again soon after a retry', () => {
    const retriedAt = 1_000_000;
    expect(recoveryFor(retriedAt, retriedAt + 50)).toBe('restart');
    expect(recoveryFor(retriedAt, retriedAt + REPEAT_FAILURE_MS - 1)).toBe('restart');
  });

  it('treats a failure long after a retry as a new one', () => {
    const retriedAt = 1_000_000;
    expect(recoveryFor(retriedAt, retriedAt + REPEAT_FAILURE_MS)).toBe('retry');
  });
});
