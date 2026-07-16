// Palette generator — Radix-style 12-step scales, designed in OKLCH, shipped as sRGB hex.
//
// The design system lives HERE, in the TUNING block: four scales (night / steel / moon / ember),
// each an explicit 12-step ladder per scheme following Radix Colors step semantics —
//   1–2 app & subtle backgrounds · 3–5 component states · 6–8 borders & tracks ·
//   9–10 solids · 11–12 text (≈ APCA Lc 60 / Lc 90 on step 2)
// — plus two overlay ladders (whiteA / blackA) for hairlines, ripples and scrims that must
// blend on any surface. React Native is sRGB-only, so OKLCH is the *authoring* space: every
// value is gamut-mapped (CSS Color 4 chroma reduction) and emitted as plain hex into
// src/constants/palette.ts, which is checked in. src/constants/theme.ts aliases the 24 public
// semantic roles onto these steps; components never see the ladders.
//
// A step is one of:
//   '#RRGGBB'   — a fixed anchor, emitted verbatim (used to pin exact values, e.g. the splash-
//                 synced dark background)
//   [l, c, h]   — an OKLCH triple, gamut-mapped to sRGB (warns when the clamp moves it > ~1 JND)
//   null        — interpolated in OKLCH between the nearest defined neighbours
//
// Run:  npm run gen:palette   (rewrites src/constants/palette.ts)
// Contract: src/constants/__tests__/theme-contract.test.ts asserts contrast + monotonicity.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { converter, differenceEuclidean, formatHex, formatHex8, inGamut, toGamut } from 'culori';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── TUNING ──────────────────────────────────────────────────────────────────────────────────
// Light ladders run 1 (lightest) → 12 (darkest); dark ladders run 1 (darkest) → 12 (lightest).
// `contrast` is the Radix "text on step 9" swatch. `alpha: true` would additionally emit a
// tinted alpha ladder (<name>A) solved against step 1 — off until a role consumes one.
//
// The "night sky & moonglow" tune (2026-07-16). Lightness skeletons carry over from the
// original hand-tuned palette (they encode the elevation model and every contrast
// relationship); chroma + hue carry the temperature story:
//   night — the panel itself, greys with a deliberate indigo night-sky cast (H 265–266)
//   steel — the one live/interactive colour: deep lapis on the light page (H ~252),
//           luminous ice against the dark sky (H ~234)
//   moon  — completion turned WARM: bronze-gold in daylight (H ~78), champagne moonglow
//           at night (H ~92); the glow step outshines the solid, like a real halo
//   ember — danger, a touch of coral so it sits with the night rather than alarm-red
// Manuscript logic: lapis ground, gold leaf — cold instruments while working, warm light
// when done.

const scales = {
  night: {
    alpha: false,
    light: [
      [0.988, 0.002, 265], // 1  app background (unused while the page sits on 2)
      [0.973, 0.003, 265], // 2  page under white cards
      [0.949, 0.004, 265], // 3  selected wash
      [0.919, 0.005, 265], // 4  border
      [0.838, 0.006, 265], // 5
      [0.759, 0.007, 265], // 6
      [0.681, 0.008, 265], // 7  disabled text
      [0.641, 0.01, 265], //  8  control outline (≥3:1 on the card)
      [0.59, 0.01, 265], //   9
      [0.539, 0.009, 265], // 10
      [0.487, 0.009, 265], // 11 secondary text (Lc 60) + ornament etching
      [0.199, 0.01, 265], //  12 text (Lc 90)
    ],
    dark: [
      [0.14, 0.016, 266], //  1  app background — keep in sync with app.json splash/adaptive-icon
      [0.199, 0.016, 266], // 2  card
      [0.257, 0.017, 266], // 3  selected wash
      [0.295, 0.018, 266], // 4  border
      [0.334, 0.019, 266], // 5
      [0.374, 0.024, 266], // 6  elevated overlay panel
      [0.491, 0.018, 266], // 7  disabled text
      [0.551, 0.024, 266], // 8  control outline
      [0.602, 0.026, 266], // 9  ornament etching
      [0.678, 0.02, 266], // 10
      [0.765, 0.016, 266], // 11 secondary text (raised from L 0.704 to clear Lc 60)
      [0.949, 0.006, 266], // 12 text
    ],
  },
  steel: {
    alpha: false,
    contrast: { light: '#FFFFFF', dark: '#060910' },
    light: [
      [0.987, 0.006, 250], // 1
      [0.966, 0.01, 250], //  2
      [0.946, 0.016, 250], // 3  tonal selected wash
      [0.935, 0.014, 250], // 4  muted data-viz track
      [0.898, 0.018, 250], // 5
      [0.863, 0.022, 250], // 6  data-viz track
      [0.742, 0.034, 250], // 7
      [0.621, 0.052, 251], // 8  strong track (elapsed arc)
      [0.43, 0.095, 252], //  9  the accent — deep lapis
      [0.375, 0.078, 252], // 10
      [0.322, 0.062, 252], // 11
      [0.27, 0.048, 252], //  12
    ],
    dark: [
      [0.162, 0.018, 250], // 1
      [0.195, 0.02, 248], //  2
      [0.229, 0.022, 246], // 3  tonal selected wash
      [0.235, 0.018, 246], // 4  muted data-viz track
      [0.282, 0.026, 244], // 5
      [0.334, 0.032, 242], // 6  data-viz track
      [0.457, 0.04, 240], //  7
      [0.58, 0.048, 238], //  8  strong track
      [0.7875, 0.075, 234], // 9  the accent — luminous ice (hue glides night-indigo → ice)
      [0.845, 0.058, 234], // 10
      [0.9, 0.042, 236], //   11
      [0.955, 0.02, 238], //  12
    ],
  },
  moon: {
    alpha: false,
    light: [
      [0.981, 0.006, 85], // 1
      [0.941, 0.012, 84], // 2
      [0.9, 0.02, 83], //    3
      [0.859, 0.028, 82], // 4
      [0.821, 0.036, 81], // 5
      [0.78, 0.045, 80], //  6  glow bloom — champagne wash
      [0.683, 0.052, 79], // 7
      [0.583, 0.058, 78], // 8
      [0.52, 0.065, 78], //  9  the lit moon / completion — bronze-gold
      [0.455, 0.058, 77], // 10
      [0.39, 0.05, 76], //   11
      [0.32, 0.04, 75], //   12
    ],
    dark: [
      [0.162, 0.008, 95], // 1
      [0.259, 0.01, 95], //  2
      [0.356, 0.013, 94], // 3
      [0.454, 0.016, 94], // 4
      [0.55, 0.02, 93], //   5
      [0.648, 0.024, 93], // 6
      [0.745, 0.028, 92], // 7
      [0.841, 0.034, 92], // 8
      [0.938, 0.042, 92], // 9  the lit moon / completion — champagne
      [0.952, 0.05, 92], //  10 glow bloom — more chromatic than the solid, a golden halo
      [0.963, 0.04, 91], //  11
      [0.975, 0.03, 90], //  12
    ],
  },
  ember: {
    alpha: false,
    contrast: { light: '#FFFFFF', dark: '#060910' },
    light: [
      [0.98, 0.007, 25], //  1
      [0.96, 0.012, 25], //  2
      [0.938, 0.019, 25], // 3  danger subtle wash
      [0.878, 0.048, 25], // 4
      [0.818, 0.078, 25], // 5
      [0.757, 0.108, 25], // 6
      [0.696, 0.138, 25], // 7
      [0.635, 0.168, 25], // 8
      [0.574, 0.197, 25], // 9  danger solid
      [0.497, 0.167, 25], // 10
      [0.421, 0.136, 25], // 11
      [0.343, 0.104, 25], // 12
    ],
    dark: [
      [0.173, 0.014, 20], // 1
      [0.196, 0.024, 21], // 2
      [0.223, 0.034, 22], // 3  danger subtle wash
      [0.302, 0.062, 23], // 4
      [0.38, 0.089, 24], //  5
      [0.459, 0.116, 24], // 6
      [0.537, 0.143, 25], // 7
      [0.616, 0.17, 25], //  8
      [0.71, 0.185, 25], //  9  danger solid — coral (raised from L 0.694 for text contrast)
      [0.775, 0.14, 23], //  10
      [0.845, 0.089, 20], // 11
      [0.917, 0.042, 18], // 12
    ],
  },
};

// Pure white/black overlay alphas (steps 1–12). Anchors in use: whiteA 3 (top-edge highlight,
// dark), whiteA 7 (ripple on filled controls), whiteA 11 (top-edge highlight, light),
// blackA 11 (scrim).
const overlays = {
  whiteA: [0.02, 0.04, 0.06, 0.08, 0.11, 0.15, 0.2, 0.28, 0.38, 0.5, 0.7, 0.9],
  blackA: [0.02, 0.04, 0.06, 0.09, 0.13, 0.18, 0.24, 0.32, 0.42, 0.55, 0.7, 0.9],
};
// ── END TUNING ──────────────────────────────────────────────────────────────────────────────

const toOklch = converter('oklch');
const clampToSrgb = toGamut('rgb', 'oklch');
const srgbOk = inGamut('rgb');
const deltaOk = differenceEuclidean('oklab'); // ~0.02 ≈ 1 JND

/** Shortest-path hue interpolation; achromatic endpoints adopt the other side's hue. */
function lerpHue(a, b, t) {
  if (a === undefined) return b;
  if (b === undefined) return a;
  let d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

/** OKLCH triple/anchor → emitted hex (verbatim for '#hex' anchors, gamut-mapped otherwise). */
function emit(step, label) {
  if (typeof step === 'string') return step.toUpperCase();
  const [l, c, h] = step;
  const color = { mode: 'oklch', l, c, h };
  const clamped = clampToSrgb(color);
  if (!srgbOk(color) && deltaOk(color, clamped) > 0.02) {
    console.warn(`  ⚠ ${label}: oklch(${l} ${c} ${h}) is outside sRGB — clamped ${deltaOk(color, clamped).toFixed(3)} ΔEok`);
  }
  return formatHex(clamped).toUpperCase();
}

/** Fill `null` steps by OKLCH interpolation between the nearest defined neighbours. */
function resolveLadder(steps, label) {
  const anchors = steps
    .map((s, i) => (s === null ? null : { i, ok: toOklch(typeof s === 'string' ? s : { mode: 'oklch', l: s[0], c: s[1], h: s[2] }) }))
    .filter(Boolean);
  if (steps[0] === null || steps[11] === null) {
    console.error(`✗ ${label}: steps 1 and 12 must be defined (they anchor interpolation).`);
    process.exit(1);
  }
  return steps.map((s, i) => {
    if (s !== null) return emit(s, `${label}[${i + 1}]`);
    const prev = anchors.filter((a) => a.i < i).at(-1);
    const next = anchors.find((a) => a.i > i);
    const t = (i - prev.i) / (next.i - prev.i);
    const l = prev.ok.l + (next.ok.l - prev.ok.l) * t;
    const c = prev.ok.c + (next.ok.c - prev.ok.c) * t;
    const h = lerpHue(prev.ok.h, next.ok.h, t);
    return emit([l, c, h], `${label}[${i + 1}]`);
  });
}

/**
 * Tinted alpha ladder (Radix A-scale construction): for each solid step S over backdrop B
 * (B = the scale's step 1), find the smallest alpha and overlay colour so that compositing
 * reproduces S exactly: a = max over channels of (s−b)/(o−b) with o = 1 (white, dark scheme)
 * or 0 (black, light scheme); then c = (S − (1−a)·B) / a. Dormant until a scale sets alpha: true.
 */
function solveAlphaLadder(hexSteps, scheme) {
  const rgb = converter('rgb');
  const B = rgb(hexSteps[0]);
  const o = scheme === 'dark' ? 1 : 0;
  return hexSteps.map((hex) => {
    const S = rgb(hex);
    const a = Math.min(
      1,
      Math.ceil(
        Math.max(...['r', 'g', 'b'].map((ch) => (o === 1 ? (S[ch] - B[ch]) / (1 - B[ch]) : (B[ch] - S[ch]) / B[ch]))) * 255,
      ) / 255,
    );
    if (a <= 0) return '#00000000';
    const c = Object.fromEntries(['r', 'g', 'b'].map((ch) => [ch, Math.min(1, Math.max(0, (S[ch] - (1 - a) * B[ch]) / a))]));
    return formatHex8({ mode: 'rgb', ...c, alpha: a }).toUpperCase();
  });
}

function overlayLadder(base, alphas) {
  return alphas.map((a) => formatHex8({ mode: 'rgb', ...base, alpha: a }).toUpperCase());
}

// Build both schemes.
const out = {};
for (const scheme of ['light', 'dark']) {
  const block = {};
  for (const [name, scale] of Object.entries(scales)) {
    const ladder = resolveLadder(scale[scheme], `${name}.${scheme}`);
    block[name] = Object.fromEntries(ladder.map((hex, i) => [i + 1, hex]));
    if (scale.contrast) block[name].contrast = scale.contrast[scheme].toUpperCase();
    if (scale.alpha) block[`${name}A`] = Object.fromEntries(solveAlphaLadder(ladder, scheme).map((hex, i) => [i + 1, hex]));
  }
  block.whiteA = Object.fromEntries(overlayLadder({ r: 1, g: 1, b: 1 }, overlays.whiteA).map((hex, i) => [i + 1, hex]));
  block.blackA = Object.fromEntries(overlayLadder({ r: 0, g: 0, b: 0 }, overlays.blackA).map((hex, i) => [i + 1, hex]));
  out[scheme] = block;
}

// Print as a TS const literal with numeric step keys.
function print(value, indent) {
  if (typeof value === 'string') return `'${value}'`;
  const pad = '  '.repeat(indent + 1);
  const entries = Object.entries(value).map(([k, v]) => `${pad}${k}: ${print(v, indent + 1)},`);
  return `{\n${entries.join('\n')}\n${'  '.repeat(indent)}}`;
}

const file = `// GENERATED — do not hand-edit. Run \`npm run gen:palette\` (source: scripts/gen-palette.mjs).
//
// Radix-style 12-step scales authored in OKLCH, gamut-mapped to sRGB hex. Step semantics:
// 1–2 backgrounds · 3–5 component states · 6–8 borders/tracks · 9–10 solids · 11–12 text.
// whiteA/blackA are pure overlay alphas (#RRGGBBAA). Only src/constants/theme.ts may import
// this — components consume the semantic roles, never raw steps.
export const palette = ${print(out, 0)} as const;
`;

const target = join(root, 'src', 'constants', 'palette.ts');
writeFileSync(target, file);
console.log(`✓ Palette generated → src/constants/palette.ts`);
for (const scheme of ['light', 'dark']) {
  console.log(`  ${scheme}: ${Object.keys(out[scheme]).join(', ')}`);
}
