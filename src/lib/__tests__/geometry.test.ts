import { describe, expect, it } from '@jest/globals';

import { flowerOfLife, octagramStar } from '@/lib/geometry';

describe('flowerOfLife', () => {
  it('produces the 7-circle seed of life at rings=1', () => {
    expect(flowerOfLife(0, 0, 10, 1)).toHaveLength(7);
  });

  it('produces 19 circles at rings=2', () => {
    expect(flowerOfLife(0, 0, 10, 2)).toHaveLength(19);
  });

  it('gives every circle the requested radius', () => {
    for (const circle of flowerOfLife(0, 0, 10, 1)) {
      expect(circle.r).toBe(10);
    }
  });
});

describe('octagramStar', () => {
  it('returns a closed 16-vertex polygon path', () => {
    const path = octagramStar(0, 0, 10, 5);
    expect(path.startsWith('M')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    // One initial M-vertex + 15 L-vertices = 16 points for an eight-point star.
    expect((path.match(/L/g) ?? []).length).toBe(15);
  });
});
