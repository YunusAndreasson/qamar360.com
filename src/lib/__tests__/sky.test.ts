import { describe, expect, it } from '@jest/globals';
import { Horizon, Observer, SiderealTime } from 'astronomy-engine';

import { equatorialToHorizontal, moonHorizontal, siderealTime, sunHorizontal } from '@/lib/sky';
import { realSkyField, STAR_FIELD } from '@/lib/starfield';

// Mirrors the tunables inside starfield.ts (re-declared, not imported, like starfield.test.ts).
const EXTINCTION_FLOOR = 0.28;
const MAX_STARS = 80;
const TIER_RANGE = {
  bright: { min: 1.6, max: 2.2 },
  mid: { min: 1.1, max: 1.5 },
  faint: { min: 0.6, max: 1.0 },
} as const;

// A fixed instant + a couple of real places, so every astronomy assertion is reproducible.
const DATE = new Date(Date.UTC(2026, 6, 18, 22, 0, 0)); // 2026-07-18 22:00 UTC
const STOCKHOLM = { lat: 59.333, lon: 18.05 };
const SYDNEY = { lat: -33.87, lon: 151.21 };

// A handful of catalog stars (J2000 RA/Dec in degrees) for cross-checks.
const STARS = {
  Sirius: { ra: 101.287, dec: -16.716 },
  Vega: { ra: 279.235, dec: 38.784 },
  Polaris: { ra: 37.95, dec: 89.264 },
  Arcturus: { ra: 213.915, dec: 19.183 },
};

/** Signed smallest angle between two azimuths (handles the 360°→0° wrap). */
const azDelta = (a: number, b: number) => (((a - b + 540) % 360) - 180);

describe('siderealTime', () => {
  it('stays within [0, 360)', () => {
    const t = siderealTime(DATE, STOCKHOLM.lon);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(360);
  });

  it('is Greenwich apparent sidereal time plus the longitude', () => {
    const gst = ((SiderealTime(DATE) * 15) % 360 + 360) % 360;
    expect(siderealTime(DATE, 0)).toBeCloseTo(gst, 6);
    // Moving 10° east advances local sidereal time by exactly 10°.
    expect(azDelta(siderealTime(DATE, 10), siderealTime(DATE, 0))).toBeCloseTo(10, 6);
  });
});

describe('equatorialToHorizontal', () => {
  it('places the celestial pole at altitude = latitude, due north', () => {
    // A star exactly at the north pole (dec 90) sits at alt = latitude, az = 0, for any sidereal time.
    for (const lst of [0, 90, 200, 315]) {
      const { alt, az } = equatorialToHorizontal(0, 90, 45, lst);
      expect(alt).toBeCloseTo(45, 6);
      expect(az).toBeCloseTo(0, 6);
    }
  });

  it('puts a star on the meridian at its transit altitude, due south', () => {
    // On the meridian (LST = RA) a star culminates at alt = 90 − |lat − dec|; south of the zenith
    // (dec < lat) it bears due south.
    const { alt, az } = equatorialToHorizontal(50, 20, 60, 50);
    expect(alt).toBeCloseTo(90 - (60 - 20), 6); // 50
    expect(az).toBeCloseTo(180, 6);
  });

  it('sends a star to the zenith when its declination equals the latitude on the meridian', () => {
    expect(equatorialToHorizontal(123, 45, 45, 123).alt).toBeCloseTo(90, 6);
  });

  it('matches astronomy-engine Horizon (geometric) for real stars and places', () => {
    for (const place of [STOCKHOLM, SYDNEY]) {
      const observer = new Observer(place.lat, place.lon, 0);
      const lst = siderealTime(DATE, place.lon);
      for (const { ra, dec } of Object.values(STARS)) {
        const mine = equatorialToHorizontal(ra, dec, place.lat, lst);
        const lib = Horizon(DATE, observer, ra / 15, dec); // no refraction → geometric
        expect(mine.alt).toBeCloseTo(lib.altitude, 2);
        expect(azDelta(mine.az, lib.azimuth)).toBeCloseTo(0, 2);
      }
    }
  });
});

describe('moonHorizontal', () => {
  it('returns finite horizontal coordinates in range', () => {
    const { alt, az } = moonHorizontal(DATE, STOCKHOLM.lat, STOCKHOLM.lon);
    expect(alt).toBeGreaterThanOrEqual(-90);
    expect(alt).toBeLessThanOrEqual(90);
    expect(az).toBeGreaterThanOrEqual(0);
    expect(az).toBeLessThan(360);
  });
});

describe('sunHorizontal', () => {
  it('returns finite horizontal coordinates in range', () => {
    const { alt, az } = sunHorizontal(DATE, STOCKHOLM.lat, STOCKHOLM.lon);
    expect(alt).toBeGreaterThanOrEqual(-90);
    expect(alt).toBeLessThanOrEqual(90);
    expect(az).toBeGreaterThanOrEqual(0);
    expect(az).toBeLessThan(360);
  });

  it('places the sun below the horizon at midnight and high at midday', () => {
    // 22:00 UTC = midnight in Stockholm (CEST): a July white night, sun just under the horizon.
    const night = sunHorizontal(DATE, STOCKHOLM.lat, STOCKHOLM.lon);
    expect(night.alt).toBeLessThan(0);
    // 09:00 UTC = noon in Mecca (UTC+3), mid-July: the sun stands near the zenith.
    const noon = sunHorizontal(new Date(Date.UTC(2026, 6, 18, 9, 0, 0)), 21.42, 39.83);
    expect(noon.alt).toBeGreaterThan(60);
  });
});

describe('realSkyField', () => {
  const field = realSkyField({ ...STOCKHOLM, date: DATE, moon: null });

  it('is deterministic for fixed inputs', () => {
    expect(realSkyField({ ...STOCKHOLM, date: DATE, moon: null })).toEqual(field);
  });

  it('renders a non-empty sky within the field bounds and count cap', () => {
    expect(field.length).toBeGreaterThan(0);
    expect(field.length).toBeLessThanOrEqual(MAX_STARS);
    for (const s of field) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(STAR_FIELD.width);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(STAR_FIELD.height);
      expect(s.r).toBeGreaterThan(0);
      expect([0, 1, 2]).toContain(s.group);
    }
  });

  it('sizes points by tier within disjoint radius ranges', () => {
    for (const s of field) {
      const range = TIER_RANGE[s.tier];
      expect(s.r).toBeGreaterThanOrEqual(range.min);
      expect(s.r).toBeLessThanOrEqual(range.max);
    }
  });

  it('keeps extinction weight in [floor, 1]', () => {
    for (const s of field) {
      expect(s.w).toBeGreaterThanOrEqual(EXTINCTION_FLOOR);
      expect(s.w).toBeLessThanOrEqual(1);
    }
  });

  it('only warm-tints non-faint stars and only glints the brightest (bright tier)', () => {
    for (const s of field) {
      if (s.warm) expect(s.tier).not.toBe('faint');
      if (s.glint) expect(s.tier).toBe('bright');
    }
  });

  it('ignores a Moon below the horizon (no phantom glare)', () => {
    const belowHorizon = realSkyField({ ...STOCKHOLM, date: DATE, moon: { alt: -20, az: 120 } });
    expect(belowHorizon).toEqual(field);
  });

  it('renders a real southern-hemisphere sky too', () => {
    const south = realSkyField({ ...SYDNEY, date: DATE, moon: null });
    expect(south.length).toBeGreaterThan(0);
    expect(south).not.toEqual(field); // a different place sees a different sky
  });
});
