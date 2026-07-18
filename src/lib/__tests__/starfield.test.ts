import { describe, expect, it } from '@jest/globals';

import { glintPath, STAR_FIELD, starField, starOpacity } from '@/lib/starfield';

const MIN_DIST = 28;
const EDGE_MARGIN = 12;
const MOON_ZONE = { x: 378, y: 60, r: 110 };

const TIER_RANGE = {
  bright: { min: 1.6, max: 2.1 },
  mid: { min: 1.1, max: 1.4 },
  faint: { min: 0.7, max: 1.0 },
} as const;

describe('starField', () => {
  const sky = starField();
  const scattered = sky.filter((s) => !s.cluster);
  const cluster = sky.filter((s) => s.cluster);

  it('draws the same sky every time (and a different one per seed)', () => {
    expect(starField()).toEqual(sky);
    expect(starField(1)).toEqual(starField(1));
    expect(starField(1)).not.toEqual(starField(2));
  });

  it('follows the magnitude pyramid: 7 bright, 15 mid, 42 faint (34 scattered + the cluster)', () => {
    expect(sky.filter((s) => s.tier === 'bright')).toHaveLength(7);
    expect(sky.filter((s) => s.tier === 'mid')).toHaveLength(15);
    expect(sky.filter((s) => s.tier === 'faint')).toHaveLength(42);
    expect(sky).toHaveLength(64);
  });

  it('keeps tier radius ranges disjoint, so a star size always names its tier', () => {
    for (const s of scattered) {
      const range = TIER_RANGE[s.tier];
      expect(s.r).toBeGreaterThanOrEqual(range.min);
      expect(s.r).toBeLessThanOrEqual(range.max);
    }
  });

  it('scatters as blue noise: no two scattered stars closer than the floor', () => {
    for (let i = 0; i < scattered.length; i++) {
      for (let j = i + 1; j < scattered.length; j++) {
        const a = scattered[i]!;
        const b = scattered[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(MIN_DIST);
      }
    }
  });

  it('keeps every star inside the field margins', () => {
    for (const s of sky) {
      expect(s.x).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(s.x).toBeLessThanOrEqual(STAR_FIELD.width - EDGE_MARGIN);
      expect(s.y).toBeGreaterThanOrEqual(EDGE_MARGIN);
      expect(s.y).toBeLessThanOrEqual(STAR_FIELD.height - EDGE_MARGIN);
    }
  });

  it('leaves the moon corner clear (glare zone around the implied light)', () => {
    for (const s of scattered) {
      expect(Math.hypot(s.x - MOON_ZONE.x, s.y - MOON_ZONE.y)).toBeGreaterThanOrEqual(MOON_ZONE.r);
    }
  });

  it('seats al-Thurayyā as one tight faint cluster that shimmers as a body', () => {
    expect(cluster).toHaveLength(8);
    // Tight: every member near Alcyone (the first, brightest member), total spread ~a thumbnail.
    const alcyone = cluster[0]!;
    for (const s of cluster) {
      expect(Math.hypot(s.x - alcyone.x, s.y - alcyone.y)).toBeLessThanOrEqual(14);
      expect(s.tier).toBe('faint'); // the Pleiades really drown under a full moon
      expect(s.group).toBe(alcyone.group); // one twinkle layer — the cluster breathes together
    }
    for (let i = 0; i < cluster.length; i++) {
      for (let j = i + 1; j < cluster.length; j++) {
        const a = cluster[i]!;
        const b = cluster[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(22);
      }
    }
  });

  it('gathers the sky overhead: most of the field in the top band, a pair of stragglers below', () => {
    const topThird = scattered.filter((s) => s.y < STAR_FIELD.height / 3);
    const bottomThird = scattered.filter((s) => s.y > (STAR_FIELD.height * 2) / 3);
    expect(topThird.length / scattered.length).toBeGreaterThanOrEqual(0.65);
    expect(bottomThird.length / scattered.length).toBeLessThanOrEqual(0.1);
  });

  it('dims by extinction toward the horizon: w eases from 1 overhead, never below the floor', () => {
    for (const s of sky) {
      expect(s.w).toBeGreaterThanOrEqual(0.28);
      expect(s.w).toBeLessThanOrEqual(1);
    }
    // Monotone in y: a lower star never outweighs a higher one.
    const byY = [...sky].sort((a, b) => a.y - b.y);
    for (let i = 1; i < byY.length; i++) {
      expect(byY[i]!.w).toBeLessThanOrEqual(byY[i - 1]!.w + 1e-9);
    }
  });

  it('spreads the breathing stars across all three twinkle layers', () => {
    const breathing = sky.filter((s) => s.tier !== 'bright');
    for (const group of [0, 1, 2] as const) {
      expect(breathing.some((s) => s.group === group)).toBe(true);
    }
    for (const s of sky) {
      expect([0, 1, 2]).toContain(s.group);
    }
  });

  it('glints exactly the three brightest anchors', () => {
    const glinted = sky.filter((s) => s.glint);
    expect(glinted).toHaveLength(3);
    for (const s of glinted) {
      expect(s.tier).toBe('bright');
    }
  });

  it('warms exactly the two brightest anchors (a temperature accent, never the cool cluster)', () => {
    const warm = sky.filter((s) => s.warm);
    expect(warm).toHaveLength(2);
    for (const s of warm) {
      expect(s.tier).toBe('bright');
      expect(s.cluster).toBe(false);
    }
  });
});

describe('starOpacity', () => {
  it('holds the bright anchors steady across the whole month', () => {
    expect(starOpacity('bright', 0)).toBe(starOpacity('bright', 0.5));
    expect(starOpacity('bright', 0.5)).toBe(starOpacity('bright', 1));
  });

  it('washes mid and faint stars out toward the full moon — but never to nothing', () => {
    for (const tier of ['mid', 'faint'] as const) {
      expect(starOpacity(tier, 0)).toBeGreaterThan(starOpacity(tier, 0.5));
      expect(starOpacity(tier, 0.5)).toBeGreaterThan(starOpacity(tier, 1));
      expect(starOpacity(tier, 1)).toBeGreaterThan(0);
    }
  });

  it('drowns the faint dust proportionally harder than the mid field (real moonlight)', () => {
    const faintSurvives = starOpacity('faint', 1) / starOpacity('faint', 0);
    const midSurvives = starOpacity('mid', 1) / starOpacity('mid', 0);
    expect(faintSurvives).toBeLessThan(midSurvives);
  });
});

describe('glintPath', () => {
  it('draws two perpendicular hairlines through the point, sized by the star', () => {
    // g = 3.5 × r = 7: a horizontal then a vertical stroke crossing at (10, 20).
    expect(glintPath(10, 20, 2)).toBe('M 3 20 L 17 20 M 10 13 L 10 27');
  });
});
