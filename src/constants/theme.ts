/**
 * The app's colour + design tokens, defined once and resolved through `useTheme()`.
 */

import '@/global.css';

import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const Colors = {
  // "Mission control" — a near-greyscale instrument panel lit by one moon. The UI is true cool
  // neutrals (no blue tint); a single pale-steel `accent` is spent sparingly on what's live or
  // interactive (an active ring, a link, the one primary action) and reads as cold telemetry.
  // The one warm note in the whole app is `complete` + `glow`: the moon turning on when a day or
  // month is finished. Two temperatures carry two meanings — cool steel = working, warm silver =
  // done — so a good state is never a same-hue guess. Light and dark are the same panel, lit or not.
  light: {
    text: '#15161A',
    textSecondary: '#5B6068',
    textDisabled: '#9499A2',
    // Light mode flips to the Linear/Notion model: white cards lifted by a soft shadow over a
    // faint neutral page (not a tint of the page). `Elevation` does the lifting, not a fill step.
    background: '#F5F6F8',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#ECEEF1',
    border: '#E2E4E9',
    // A faint top edge so an elevated card reads as lit from above (paired with `Elevation`).
    topHighlight: 'rgba(255,255,255,0.7)',
    // Deep steel — the pale-steel accent needs real depth to carry contrast on white.
    accent: '#3C5068',
    accentText: '#FFFFFF',
    // Tonal "selected" wash — replaces the old saturated-accent fill so a chosen chip reads as
    // lit, not blocked-in.
    accentSubtle: '#EAEDF2',
    // Progress tracks/empty states must stay perceivable on the card (≥~3:1 non-text contrast).
    accentTrack: '#CDD2DB',
    accentTrackMuted: '#E7E9EE',
    accentTrackStrong: '#7C879A',
    // Hairline colour for the geometric ornament layer — a neutral cool steel so the lattice reads
    // as faint "telemetry" etching, only ever drawn at low opacity (ornament/*).
    pattern: '#45505E',
    // The moon / completion silver — cool moonlight, dark enough to read on the light page.
    // Differentiated from in-progress by brightness + glow (not warmth). Completion *visuals* only
    // (lit moon disc, closed ring, the done check), never text.
    complete: '#566071',
    // The bloom behind a lit moon / a done check — used at low opacity in a radial gradient.
    glow: '#AEB8C6',
    danger: '#D4333A',
    dangerText: '#FFFFFF',
    dangerSubtle: '#F7E6E7',
    rippleOnFill: '#FFFFFF33',
  },
  // "Mission control" — night side. `background` is a near-black cool neutral; keep it in sync with
  // the native splash / adaptive-icon background (app.json) so launch flows seamlessly into the app.
  dark: {
    text: '#ECEEF2',
    textSecondary: '#9AA0AB',
    textDisabled: '#5C616B',
    // Kept identical to the native splash / adaptive-icon background (app.json) so launch flows
    // seamlessly into the app.
    background: '#08090C',
    backgroundElement: '#15161A',
    backgroundSelected: '#212329',
    border: '#2A2C33',
    // A whisper of light on the card's top edge — the Linear "lit from above" hairline.
    topHighlight: 'rgba(255,255,255,0.06)',
    // Pale steel — luminous against deep space, but desaturated so it reads as instrument light,
    // not a candy blue. Spent sparingly: active rings, links, the one primary action.
    accent: '#9FB2C8',
    accentText: '#0A0B0D',
    accentSubtle: '#1A1D23',
    accentTrack: '#33363F',
    accentTrackMuted: '#1B1D22',
    accentTrackStrong: '#6E7C8E',
    // Neutral cool steel — faint etched-telemetry lines against deep space. See light note.
    pattern: '#79818E',
    // Cool luminous moonlight — the moon glowing against deep space, and the completion silver.
    // A real moon reads cool silver-white, not warm; "done" is set apart by brightness + glow (it's
    // far brighter than the muted steel of in-progress), not by temperature.
    complete: '#E6EBF3',
    glow: '#EAEFF7',
    danger: '#FF5C6E',
    dangerText: '#0A0B0D',
    dangerSubtle: '#2A1417',
    rippleOnFill: '#FFFFFF33',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const FontWeight = {
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
  smallDense: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: FontWeight.medium,
  },
  smallDenseBold: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: FontWeight.bold,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: FontWeight.medium,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: FontWeight.semibold,
  },
  defaultBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: FontWeight.bold,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: FontWeight.semibold,
  },
  subtitleBold: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: FontWeight.bold,
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

/** Corner-radius scale — keep surfaces consistent instead of hand-picking per component. */
export const Radius = {
  /** Inputs, chips, buttons, small pills. */
  control: 8,
  /** Inline notices / banners. */
  banner: 12,
  /** Cards and grouped-list surfaces. */
  card: 14,
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
} satisfies Record<string, ViewStyle>;

/** Press-state opacity for filled rows/cards/buttons. */
export const Pressed = { dim: 0.6 } as const;

/** Opacity for a control disabled by dimming (rather than a colour swap, as `AppButton` does). */
export const Disabled = 0.4;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
