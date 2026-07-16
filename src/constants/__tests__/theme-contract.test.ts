/**
 * The colour contract — what the palette PROMISES, enforced.
 *
 * The 24 semantic roles in theme.ts alias onto generated Radix-style scales (palette.ts).
 * Radix's scale guarantees are informal ("step 11/12 hold Lc 60/90 on step 2"); this suite makes
 * the ones this app relies on formal, against the roles components actually consume. Thresholds
 * are tight round numbers the current palette clears — when retuning curves in
 * scripts/gen-palette.mjs, a failure here means a real legibility regression, not test noise.
 *
 * Ratchet target (below the Radix ideal today; raise the threshold when a retune clears it):
 *   - dark dangerText on danger sits at ~Lc 50 (WCAG-fine at 7:1; APCA is the stricter lens)
 */

import { describe, expect, it } from '@jest/globals';
import Color from 'colorjs.io';

import { palette } from '@/constants/palette';
import { Colors, type ThemeColor } from '@/constants/theme';

import appJson from '../../../app.json';

type Scheme = 'light' | 'dark';
const SCHEMES: Scheme[] = ['light', 'dark'];
const SCALES = ['night', 'steel', 'moon', 'ember'] as const;

/** APCA lightness contrast, polarity-insensitive. Argument order: (background, text). */
function apca(bg: string, text: string): number {
  return Math.abs(Color.contrast(new Color(bg), new Color(text), 'APCA'));
}

function wcag(a: string, b: string): number {
  return Color.contrast(new Color(a), new Color(b), 'WCAG21');
}

/** Assert APCA Lc of every (background, text) role pair clears `min` in both schemes. */
function expectApca(pairs: [bg: ThemeColor, text: ThemeColor][], min: number) {
  for (const scheme of SCHEMES) {
    for (const [bg, text] of pairs) {
      expect(apca(Colors[scheme][bg], Colors[scheme][text])).toBeGreaterThanOrEqual(min);
    }
  }
}

/** Assert WCAG 2.1 ratio of every role pair clears `min` in both schemes. */
function expectWcag(pairs: [a: ThemeColor, b: ThemeColor][], min: number) {
  for (const scheme of SCHEMES) {
    for (const [a, b] of pairs) {
      expect(wcag(Colors[scheme][a], Colors[scheme][b])).toBeGreaterThanOrEqual(min);
    }
  }
}

describe('APCA text contracts (Radix step-11/12 semantics)', () => {
  it('primary text holds Lc 90 on every reading surface', () => {
    expectApca(
      [
        ['background', 'text'],
        ['backgroundElement', 'text'],
        ['backgroundSelected', 'text'],
      ],
      90,
    );
  });

  it('primary text holds Lc 80 on the elevated overlay panel', () => {
    expectApca([['backgroundElevated', 'text']], 80);
  });

  it('secondary text holds Lc 60 on page and card (the Radix step-11 promise)', () => {
    expectApca(
      [
        ['background', 'textSecondary'],
        ['backgroundElement', 'textSecondary'],
      ],
      60,
    );
  });

  it('text on the accent solid holds Lc 65', () => {
    expectApca([['accent', 'accentText']], 65);
  });

  it('text on the danger solid holds Lc 50 (ratchet target: 60)', () => {
    expectApca([['danger', 'dangerText']], 50);
  });

  it('disabled text stays above the legibility floor (Lc 15 — deliberate, WCAG-exempt)', () => {
    expectApca([['backgroundElement', 'textDisabled']], 15);
  });
});

describe('WCAG 2.1 contracts (non-text UI and coloured text)', () => {
  it('interactive control outline clears 3:1 on the card (SC 1.4.11 — the Radix step-8 promise)', () => {
    expectWcag([['controlTrack', 'backgroundElement']], 3);
  });

  it('accent clears 4.5:1 as link text and 3:1 as a ring', () => {
    expectWcag([['accent', 'backgroundElement']], 4.5);
    expectWcag([['accent', 'background']], 3);
  });

  it('danger clears 4.5:1 as a destructive text label', () => {
    expectWcag([['danger', 'backgroundElement']], 4.5);
  });

  it('completion light clears 3:1 everywhere it shines (page, card, celebration panel)', () => {
    expectWcag(
      [
        ['complete', 'background'],
        ['complete', 'backgroundElement'],
        ['complete', 'backgroundElevated'],
      ],
      3,
    );
  });

  it('text on solids also clears 4.5:1', () => {
    expectWcag([['accentText', 'accent']], 4.5);
    expectWcag([['dangerText', 'danger']], 4.5);
  });
});

describe('scale structure', () => {
  it('every ladder is strictly monotone in luminance (light descends, dark ascends)', () => {
    for (const scheme of SCHEMES) {
      for (const scale of SCALES) {
        const luminances = Object.entries(palette[scheme][scale])
          .filter(([key]) => key !== 'contrast')
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, hex]) => new Color(hex).luminance);
        expect(luminances).toHaveLength(12);
        luminances.forEach((current, i) => {
          if (i === 0) return;
          const previous = luminances[i - 1] ?? Number.NaN;
          const step = scheme === 'light' ? previous - current : current - previous;
          expect(step).toBeGreaterThan(0);
        });
      }
    }
  });
});

describe('native launch sync', () => {
  it('app.json splash + adaptive icon match the dark background (seamless launch seam)', () => {
    const dark = Colors.dark.background.toUpperCase();
    expect(appJson.expo.android.adaptiveIcon.backgroundColor.toUpperCase()).toBe(dark);
    const plugins = appJson.expo.plugins as unknown as (string | [string, Record<string, unknown>])[];
    const splash = plugins.find(
      (p): p is [string, { backgroundColor: string }] => Array.isArray(p) && p[0] === 'expo-splash-screen',
    );
    expect(splash?.[1].backgroundColor.toUpperCase()).toBe(dark);
  });
});
