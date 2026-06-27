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

  it('blooms at the heart: centre weight is 1, rim circles are dimmer, all within (0, 1]', () => {
    const circles = flowerOfLife(0, 0, 10, 1);
    const heart = circles.find((c) => c.cx === 0 && c.cy === 0);
    expect(heart?.w).toBe(1);
    for (const c of circles) {
      expect(c.w).toBeGreaterThan(0);
      expect(c.w).toBeLessThanOrEqual(1);
    }
    const rim = circles.filter((c) => !(c.cx === 0 && c.cy === 0));
    expect(rim.every((c) => c.w < 1)).toBe(true);
  });

  it('eases monotonically outward (a nearer circle never glows dimmer than a farther one)', () => {
    const byDist = flowerOfLife(0, 0, 10, 2)
      .map((c) => ({ d: Math.hypot(c.cx, c.cy), w: c.w }))
      .sort((a, b) => a.d - b.d);
    for (let i = 1; i < byDist.length; i++) {
      expect(byDist[i]!.w).toBeLessThanOrEqual(byDist[i - 1]!.w + 1e-9);
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
