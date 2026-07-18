/**
 * The app's colour + design tokens, defined once and resolved through `useTheme()`.
 */

import '@/global.css';

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

import { palette } from '@/constants/palette';

// "Mission control under a night sky" — an instrument panel lit by one moon. The values live
// in generated Radix-style 12-step scales (src/constants/palette.ts, authored in OKLCH by
// scripts/gen-palette.mjs); this block is the app's public vocabulary — 25 semantic roles
// aliased onto scale steps. Components read ONLY these roles via `useTheme()`, never raw steps.
// The panel neutrals carry a deliberate indigo night-sky cast. A single steel `accent` — deep
// lapis on the light page, luminous ice against the dark sky — is spent sparingly on what's
// live or interactive (an active ring, a link, the one primary action). `complete` + `glow`
// are the moon turning on when a day or month is finished, and they are WARM: bronze-gold in
// daylight, champagne moonglow at night. Two temperatures carry two meanings — cold steel =
// working, warm gold = done — so a good state is never a same-hue guess (manuscript logic:
// lapis ground, gold leaf). Light and dark are the same panel, day side and night side.
export const Colors = {
  light: {
    text: palette.light.night[12],
    textSecondary: palette.light.night[11],
    textDisabled: palette.light.night[7],
    // Light mode flips to the Linear/Notion model: white cards lifted by a soft shadow over a
    // faint neutral page (not a tint of the page). `Elevation` does the lifting, not a fill step —
    // the card whites are deliberate literals, whiter than night step 1 (Radix's white-card model).
    background: palette.light.night[2],
    backgroundElement: '#FFFFFF',
    // A raised surface for a focused overlay (modal / celebration card) sitting on a scrim. On the
    // light page the element white already reads as lifted, so it matches `backgroundElement`; the
    // dark side lightens it (a dark-theme elevation overlay) so the panel clears its scrim.
    backgroundElevated: '#FFFFFF',
    backgroundSelected: palette.light.night[3],
    border: palette.light.night[4],
    // A faint top edge so an elevated card reads as lit from above (paired with `Elevation`).
    topHighlight: palette.light.whiteA[11],
    // Deep steel — the accent needs real depth to carry contrast on white.
    accent: palette.light.steel[9],
    accentText: palette.light.steel.contrast,
    // Tonal "selected" wash — replaces the old saturated-accent fill so a chosen chip reads as
    // lit, not blocked-in.
    accentSubtle: palette.light.steel[3],
    // The Progress data-viz tracks — a moon-ring's unfilled remainder, the year baseline. These are
    // informational (the value reads from the filled arc, not the rim), so they stay quiet on the
    // steel border steps (4/6/8). An *interactive* control's outline is a different bar — see
    // `controlTrack`.
    accentTrack: palette.light.steel[6],
    accentTrackMuted: palette.light.steel[4],
    accentTrackStrong: palette.light.steel[8],
    // Outline for interactive hollow controls — the checklist's tap-to-complete ring, the count
    // stepper buttons. Night step 8 is the Radix "strong border" slot: clears ≥3:1 on the card so
    // the affordance reads (the faint data-viz tracks above don't, and shouldn't be reused here).
    controlTrack: palette.light.night[8],
    // Hairline colour for the geometric ornament layer — faint "telemetry" etching, only ever
    // drawn at low opacity (ornament/*).
    pattern: palette.light.night[11],
    // A star as a point of light (ornament/star-field) — cool and pale, never the warm gold of
    // `glow`/`complete` (that temperature means "done"). Decorative-only, always at low opacity
    // like `pattern`; deliberately sub-contrast, so no contract line. By day the sky holds no
    // stars — light mode uses a dim step and the component crushes it further.
    starlight: palette.light.night[9],
    // The moon / completion light — warm bronze-gold, dark enough to read on the light page.
    // Completion *visuals* only (lit moon disc, closed ring, the done check), never body text.
    complete: palette.light.moon[9],
    // The bloom behind a lit moon / a done check — used at low opacity in a radial gradient.
    glow: palette.light.moon[6],
    // The resting sun glyph on the current chapter's stack — a deliberate literal (like the
    // card whites): amber-ochre, clearly more *orange* than the bronze-gold `complete`, so the
    // sun's presence can never read as achievement (warm gold means DONE; this is just daylight).
    sun: '#B8783C',
    danger: palette.light.ember[9],
    dangerText: palette.light.ember.contrast,
    dangerSubtle: palette.light.ember[3],
    rippleOnFill: palette.light.whiteA[7],
    // The darkened app behind a focused overlay (the celebration card). One value both sides:
    // the moment is deliberately night-like even on the light page.
    scrim: palette.light.blackA[11],
  },
  // Night side. `background` is night step 1; keep it in sync with the native splash /
  // adaptive-icon background (app.json) so launch flows seamlessly into the app.
  dark: {
    text: palette.dark.night[12],
    textSecondary: palette.dark.night[11],
    textDisabled: palette.dark.night[7],
    // Kept identical to the native splash / adaptive-icon background (app.json).
    background: palette.dark.night[1],
    backgroundElement: palette.dark.night[2],
    // Raised surface for a focused overlay on a scrim — a dark-theme elevation overlay: lifted well
    // above `backgroundElement` (night step 6, off-label as an elevation fill) so a modal/
    // celebration card reads as a distinct panel against the darkened app behind it (the near-black
    // element fill would otherwise vanish into the scrim). Deliberately a clear slate lift (not a
    // hair above black): #262B33 still blended into the scrim.
    backgroundElevated: palette.dark.night[6],
    backgroundSelected: palette.dark.night[3],
    border: palette.dark.night[4],
    // A whisper of light on the card's top edge — the Linear "lit from above" hairline.
    topHighlight: palette.dark.whiteA[3],
    // Luminous against deep space, but desaturated so it reads as instrument light, not a candy
    // blue. Spent sparingly: active rings, links, the one primary action.
    accent: palette.dark.steel[9],
    accentText: palette.dark.steel.contrast,
    accentSubtle: palette.dark.steel[3],
    accentTrack: palette.dark.steel[6],
    accentTrackMuted: palette.dark.steel[4],
    accentTrackStrong: palette.dark.steel[8],
    // See light note — an interactive control outline that clears ≥3:1 on the dark card.
    controlTrack: palette.dark.night[8],
    // Faint etched-telemetry lines against deep space. See light note.
    pattern: palette.dark.night[9],
    // See light note — the palest night step: a cool point of light against deep space.
    starlight: palette.dark.night[12],
    // Champagne moonglow — the moon glowing warm against the indigo sky. "Done" is set apart by
    // both brightness AND temperature (warm gold vs the cold steel of in-progress).
    complete: palette.dark.moon[9],
    glow: palette.dark.moon[10],
    // See light note. On the night side it is the star-field's warm-anchor cream (STAR_WARM) —
    // the sun glyph carries the same temperature as the sky's warm stars, not the moon's gold.
    sun: '#F2D8B8',
    danger: palette.dark.ember[9],
    dangerText: palette.dark.ember.contrast,
    dangerSubtle: palette.dark.ember[3],
    rippleOnFill: palette.dark.whiteA[7],
    // See light note — the same night falls over the dark page.
    scrim: palette.dark.blackA[11],
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// The weight ramp: regular (400) body for a clean, modern read; medium (500) for the smaller 14pt
// labels (optical compensation — small text carries a little more weight to hold its colour — and
// it measures reliably on Android, where regular under-sizes the diacritic month names); semibold
// (600) for emphasis + headings; bold (700) for the strongest accents and the display readout.
export const FontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/**
 * Dynamic Type cap for dense grid/axis labels (day numbers, weekday/month abbreviations)
 * so large accessibility text can't shatter a fixed-size chart or strip. Body, titles and
 * the hero metrics scale freely — only these tight labels are capped.
 */
export const DenseLabelScale = 1.3;

export const Typography = {
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: FontWeight.medium,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: FontWeight.bold,
  },
  smallCompact: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: FontWeight.medium,
    // Day/axis numerals align in their columns instead of dancing as the digits change.
    fontVariant: ['tabular-nums'],
  },
  smallCompactBold: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: FontWeight.bold,
    fontVariant: ['tabular-nums'],
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: FontWeight.regular,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: FontWeight.semibold,
  },
  // A list-row's primary label — one iOS-body step (17pt) above `default`, so a habit / stack
  // member / settings row title reads as the row's content against its 14pt `small` meta. Keeps
  // `default`'s 24pt leading so it still centers against the 28pt completion ring and 22pt icons.
  rowTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: FontWeight.regular,
  },
  // A card / section heading — one clear step above body, so titles (the Progress stat cards) read
  // as headings by both size and weight against the regular body. Sits below the native large nav
  // title and the hero `display`. No negative tracking: at 18pt it's imperceptible, and on Android
  // `letterSpacing` on a flex-row Text mis-measures the row and clips the sibling trailing caption
  // (the month name). Tracking is reserved for `subtitle`/`display`, which sit alone in their row.
  heading: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: FontWeight.semibold,
  },
  // The wordmark / monogram tier. Tighter leading and a touch of negative tracking so a 32pt title
  // reads as set type, not scaled-up body.
  subtitle: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: FontWeight.semibold,
    letterSpacing: -0.5,
  },
  // The instrument readout — the Progress hero's orbit degrees. Oversized, tightly tracked and
  // tabular so it reads as a precise telemetry value, not body copy.
  display: {
    fontSize: 46,
    lineHeight: 50,
    fontWeight: FontWeight.bold,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Letter-spacing beyond what a `Typography` style carries. `overline` is the positive tracking
 *  on the small uppercase captions ({@link SectionLabel}, {@link FieldLabel}) — caps read tight
 *  and cramped at native spacing; a little extra makes them read as deliberate labels. */
export const Tracking = { overline: 0.6 } as const;

/** Corner-radius scale — keep surfaces consistent instead of hand-picking per component. */
export const Radius = {
  /** Inputs, chips, small pills. */
  control: 8,
  /** Buttons — a touch softer than inputs so a 48pt CTA reads modern, not blocky. */
  button: 12,
  /** Inline notices / banners. */
  banner: 12,
  /** Cards and grouped-list surfaces. */
  card: 14,
  /** A focused overlay panel (the celebration card) — a step softer than a card, since it
   *  floats free of the layout grid. */
  overlay: 20,
  /** Fully rounded — circular tap targets (add pills, day pills, steppers, monogram). */
  full: 999,
} as const;

/**
 * One soft elevation recipe for raised surfaces (cards), so depth is tuned in a single place —
 * a gentle shadow that lifts a card off the deep-space page without announcing itself. Pair with
 * `theme.topHighlight` on the top edge for the "lit from above" read.
 */
export const Elevation = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  /** A tight lift for a small raised control (the segmented thumb) — not the big card shadow. */
  thumb: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
} satisfies Record<string, ViewStyle>;

/** Press-state opacity for filled rows/cards/buttons. */
export const Pressed = { dim: 0.6 } as const;

/** Opacity for a control disabled by dimming (rather than a colour swap, as `AppButton` does). */
export const Disabled = 0.4;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
