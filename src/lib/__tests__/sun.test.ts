import { describe, expect, it } from '@jest/globals';

import { localDate } from '@/lib/dates';
import { sunHorizontal } from '@/lib/sky';
import type { StarTier } from '@/lib/starfield';
import {
  asDayPart,
  DAY_PARTS,
  displayDateISO,
  horizonTint,
  starVisibility,
  sunsetOn,
} from '@/lib/sun';


// Mirrors the tunables inside sun.ts (re-declared, not imported, like starfield.test.ts).
const SUN_COOL = '#A9C2E8';
const TINT_PEAK = 0.08;
const BANDS: Record<StarTier, { hi: number; lo: number }> = {
  bright: { hi: -2, lo: -8 },
  mid: { hi: -6, lo: -12 },
  faint: { hi: -12, lo: -18 },
};
const FLOORS: Record<StarTier, number> = { bright: 0.7, mid: 0.45, faint: 0.25 };
const TIERS = Object.keys(BANDS) as StarTier[];

// Real places spanning the app's world: the fallback city, a high-latitude capital whose June
// nights never fully darken, and a polar-circle city with true midnight sun and polar night.
const MECCA = { lat: 21.42, lon: 39.83 };
const STOCKHOLM = { lat: 59.333, lon: 18.05 };
const TROMSO = { lat: 69.65, lon: 18.96 };

describe('starVisibility', () => {
  it('is exactly hidden at each band top and fully out at each band floor', () => {
    for (const tier of TIERS) {
      expect(starVisibility(tier, BANDS[tier].hi, 'literal')).toBe(0);
      expect(starVisibility(tier, BANDS[tier].lo, 'literal')).toBe(1);
    }
  });

  it('is monotone non-increasing in sun altitude for every tier and mode', () => {
    for (const mode of ['literal', 'inspired'] as const) {
      for (const tier of TIERS) {
        let prev = starVisibility(tier, -25, mode);
        for (let alt = -24.5; alt <= 30; alt += 0.5) {
          const v = starVisibility(tier, alt, mode);
          expect(v).toBeLessThanOrEqual(prev + 1e-12);
          prev = v;
        }
      }
    }
  });

  it('lets the stars emerge bright tier first at every altitude', () => {
    for (let alt = -25; alt <= 30; alt += 0.5) {
      const bright = starVisibility('bright', alt, 'literal');
      const mid = starVisibility('mid', alt, 'literal');
      const faint = starVisibility('faint', alt, 'literal');
      expect(bright).toBeGreaterThanOrEqual(mid);
      expect(mid).toBeGreaterThanOrEqual(faint);
    }
    // Civil dusk: the anchors are burning while the mid field is barely arriving and the dust
    // hasn't — the "stars come out one by one" contract.
    expect(starVisibility('bright', -6, 'literal')).toBeGreaterThan(0.5);
    expect(starVisibility('mid', -6, 'literal')).toBe(0);
    expect(starVisibility('faint', -6, 'literal')).toBe(0);
  });

  it('renders a Stockholm white night with no special case', () => {
    // June solstice at 59°N: the sun bottoms out near −7° — anchors alight, dust never returns.
    expect(starVisibility('bright', -7, 'literal')).toBeGreaterThan(0.7);
    expect(starVisibility('mid', -7, 'literal')).toBeLessThan(0.1);
    expect(starVisibility('faint', -7, 'literal')).toBe(0);
  });

  it('inspired mode floors daylight and still reaches full dark', () => {
    for (const tier of TIERS) {
      expect(starVisibility(tier, 30, 'inspired')).toBeCloseTo(FLOORS[tier], 10);
      expect(starVisibility(tier, -18, 'inspired')).toBeCloseTo(1, 10);
      // The floor only ever lifts the literal curve — transitions stay the same shape.
      for (let alt = -20; alt <= 30; alt += 1) {
        expect(starVisibility(tier, alt, 'inspired')).toBeGreaterThanOrEqual(
          starVisibility(tier, alt, 'literal'),
        );
      }
    }
  });

  it('keeps a night sky through a white-night twilight the tiers never open in', () => {
    // The regression this pins: at 59°N from April to August the sun bottoms out near −10°,
    // above the faint tier's −12° band top, so a fixed daylight floor rendered the dust at its
    // *midday* value all summer — the sky went empty for a third of the year. The floor now
    // rides the overall darkness instead.
    const summerNight = -10.5;
    expect(starVisibility('faint', summerNight, 'inspired')).toBeGreaterThan(
      2 * FLOORS.faint * 0.9,
    );
    // Still darker than the tiers that HAVE opened — the emergence ladder must survive the lift.
    expect(starVisibility('bright', summerNight, 'inspired')).toBeGreaterThan(
      starVisibility('mid', summerNight, 'inspired'),
    );
    expect(starVisibility('mid', summerNight, 'inspired')).toBeGreaterThan(
      starVisibility('faint', summerNight, 'inspired'),
    );
    // And the lift is genuinely twilight-only: just after sunset it has barely started.
    expect(starVisibility('faint', -4, 'inspired')).toBeLessThan(FLOORS.faint * 1.2);
  });
});

describe('horizonTint', () => {
  it('vanishes in full day and deep night', () => {
    for (const az of [100, 260]) {
      expect(horizonTint(40, az)).toBeNull();
      expect(horizonTint(10, az)).toBeNull();
      expect(horizonTint(-14, az)).toBeNull();
      expect(horizonTint(-20, az)).toBeNull();
    }
  });

  it('burns warm through an evening dusk', () => {
    const tint = horizonTint(-2, 260);
    expect(tint).not.toBeNull();
    expect(tint!.opacity).toBeGreaterThan(0.04);
    expect(tint!.opacity).toBeLessThanOrEqual(TINT_PEAK + 1e-9);
    // Warm-leaning: the red channel sits closer to the apricot than the steel-blue.
    expect(parseInt(tint!.color.slice(1, 3), 16)).toBeGreaterThan(199);
  });

  it('washes pure cool at a morning civil dawn', () => {
    const tint = horizonTint(-6, 100);
    expect(tint).not.toBeNull();
    expect(tint!.color).toBe(SUN_COOL);
    expect(tint!.opacity).toBeCloseTo(TINT_PEAK, 5);
  });

  it('never exceeds the peak budget and never steps visibly', () => {
    for (const az of [100, 260]) {
      let prev = horizonTint(-16, az)?.opacity ?? 0;
      for (let alt = -15.75; alt <= 12; alt += 0.25) {
        const opacity = horizonTint(alt, az)?.opacity ?? 0;
        expect(opacity).toBeLessThanOrEqual(TINT_PEAK + 1e-9);
        // A minute of sun travel (≤0.25°) may never move the wash by a visible amount.
        expect(Math.abs(opacity - prev)).toBeLessThan(0.005);
        prev = opacity;
      }
    }
  });

  it('never steps across the 0°/180° azimuth meridians either', () => {
    // Inside the twilight tents the sun DOES cross these: every high-summer midnight at high
    // latitudes sweeps az through 0° near the trough (Stockholm's own midsummer ~-7°), and a
    // subarctic winter noon crosses 180° while low. The morning/evening weighting must blend
    // there, not flip — a boolean on `az < 180` popped the wash between two adjacent minutes.
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
    for (const [alt, azStart] of [
      [-7, 350], // midnight-sun trough crossing az 0/360
      [-4, 170], // low winter noon crossing az 180
      [2, 170], // and inside the warm tent
    ] as const) {
      let prev = horizonTint(alt, azStart % 360);
      for (let step = 0.25; step <= 20; step += 0.25) {
        const tint = horizonTint(alt, (azStart + step) % 360);
        // A quarter-degree of azimuth travel may never move the wash or its hue visibly.
        expect(Math.abs((tint?.opacity ?? 0) - (prev?.opacity ?? 0))).toBeLessThan(0.002);
        if (tint && prev) {
          for (const i of [0, 1, 2]) expect(Math.abs(channel(tint.color, i) - channel(prev.color, i))).toBeLessThan(6);
        }
        prev = tint;
      }
    }
  });
});

describe('sunsetOn', () => {
  it('finds the real sunset (the sun stands at the set altitude at that instant)', () => {
    for (const [place, iso] of [
      [MECCA, '2026-07-18'],
      [STOCKHOLM, '2026-06-21'],
      [STOCKHOLM, '2026-12-21'],
    ] as const) {
      const sunset = sunsetOn(iso, place.lat, place.lon);
      expect(sunset).not.toBeNull();
      // Refracted centre altitude at the set instant sits just under the horizon.
      const { alt } = sunHorizontal(sunset!, place.lat, place.lon);
      expect(alt).toBeGreaterThan(-1.5);
      expect(alt).toBeLessThan(0.2);
      // And within that local calendar day's 24 hours.
      const dayStart = localDate(iso).getTime();
      expect(sunset!.getTime()).toBeGreaterThanOrEqual(dayStart);
      expect(sunset!.getTime()).toBeLessThan(dayStart + 24 * 3600_000);
    }
  });

  it('sets late on a Stockholm June evening and early in December', () => {
    const june = sunsetOn('2026-06-21', STOCKHOLM.lat, STOCKHOLM.lon)!;
    const december = sunsetOn('2026-12-21', STOCKHOLM.lat, STOCKHOLM.lon)!;
    expect(june.getHours()).toBeGreaterThanOrEqual(20);
    expect(june.getHours()).toBeLessThanOrEqual(23);
    expect(december.getHours()).toBeGreaterThanOrEqual(13);
    expect(december.getHours()).toBeLessThanOrEqual(16);
  });

  it('returns null under the midnight sun and through the polar night', () => {
    expect(sunsetOn('2026-06-21', TROMSO.lat, TROMSO.lon)).toBeNull();
    expect(sunsetOn('2026-12-21', TROMSO.lat, TROMSO.lon)).toBeNull();
  });

  it('caches per day and place — repeat calls return the identical result', () => {
    const first = sunsetOn('2026-07-18', STOCKHOLM.lat, STOCKHOLM.lon);
    expect(sunsetOn('2026-07-18', STOCKHOLM.lat, STOCKHOLM.lon)).toBe(first);
    expect(sunsetOn('2026-06-21', TROMSO.lat, TROMSO.lon)).toBeNull(); // cached null, still null
  });
});

describe('displayDateISO', () => {
  it('shows today until the real sunset, then tomorrow', () => {
    expect(displayDateISO(localDate('2026-07-18', 12, 0), STOCKHOLM.lat, STOCKHOLM.lon)).toBe('2026-07-18');
    expect(displayDateISO(localDate('2026-07-18', 23, 0), STOCKHOLM.lat, STOCKHOLM.lon)).toBe('2026-07-19');
  });

  it('keeps the after-midnight hours on the day that began at last sunset', () => {
    // 00:30 belongs to the Islamic day that began yesterday evening — whose label IS today's
    // Gregorian day. The label never jumps backward across midnight.
    expect(displayDateISO(localDate('2026-07-19', 0, 30), STOCKHOLM.lat, STOCKHOLM.lon)).toBe('2026-07-19');
  });

  it('never flips where no sunset exists (polar) — honest degradation', () => {
    expect(displayDateISO(localDate('2026-06-21', 20, 0), TROMSO.lat, TROMSO.lon)).toBe('2026-06-21');
  });
});

describe('asDayPart', () => {
  it('narrows exactly the four stored values', () => {
    for (const part of DAY_PARTS) expect(asDayPart(part)).toBe(part);
    expect(DAY_PARTS).toHaveLength(4);
    expect(asDayPart('Morning')).toBeNull(); // DB stores lowercase; anything else is not an anchor
    expect(asDayPart('')).toBeNull();
    expect(asDayPart(null)).toBeNull();
    expect(asDayPart(undefined)).toBeNull();
  });
});
