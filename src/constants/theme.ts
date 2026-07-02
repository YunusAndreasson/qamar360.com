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
    text: '#141619',
    textSecondary: '#5C6065',
    textDisabled: '#95999E',
    // Light mode flips to the Linear/Notion model: white cards lifted by a soft shadow over a
    // faint neutral page (not a tint of the page). `Elevation` does the lifting, not a fill step.
    background: '#F6F6F7',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EDEEEF',
    border: '#E3E4E6',
    // A faint top edge so an elevated card reads as lit from above (paired with `Elevation`).
    topHighlight: 'rgba(255,255,255,0.7)',
    // Deep steel — the pale-steel accent needs real depth to carry contrast on white.
    accent: '#355070',
    accentText: '#FFFFFF',
    // Tonal "selected" wash — replaces the old saturated-accent fill so a chosen chip reads as
    // lit, not blocked-in.
    accentSubtle: '#E7EEF5',
    // The Progress data-viz tracks — a moon-ring's unfilled remainder, the year baseline. These are
    // informational (the value reads from the filled arc, not the rim), so they stay quiet. An
    // *interactive* control's outline is a different bar — see `controlTrack`.
    accentTrack: '#CBD3DC',
    accentTrackMuted: '#E5EAF0',
    accentTrackStrong: '#77889D',
    // Outline for interactive hollow controls — the checklist's tap-to-complete ring, the count
    // stepper buttons. Clears ≥3:1 on the card so the affordance reads (the faint data-viz tracks
    // above don't, and shouldn't be reused here).
    controlTrack: '#868D96',
    // Hairline colour for the geometric ornament layer — a neutral cool steel so the lattice reads
    // as faint "telemetry" etching, only ever drawn at low opacity (ornament/*).
    pattern: '#44505F',
    // The moon / completion silver — cool moonlight, dark enough to read on the light page.
    // Differentiated from in-progress by brightness + glow (not warmth). Completion *visuals* only
    // (lit moon disc, closed ring, the done check), never text.
    complete: '#506175',
    // The bloom behind a lit moon / a done check — used at low opacity in a radial gradient.
    glow: '#AAB9CA',
    danger: '#D43240',
    dangerText: '#FFFFFF',
    dangerSubtle: '#F7E6E5',
    rippleOnFill: '#FFFFFF33',
  },
  // "Mission control" — night side. `background` is a near-black cool neutral; keep it in sync with
  // the native splash / adaptive-icon background (app.json) so launch flows seamlessly into the app.
  dark: {
    text: '#EDEEEF',
    textSecondary: '#9CA0A6',
    textDisabled: '#5C6168',
    // Kept identical to the native splash / adaptive-icon background (app.json) so launch flows
    // seamlessly into the app.
    background: '#08090C',
    backgroundElement: '#141619',
    backgroundSelected: '#202427',
    border: '#292D31',
    // A whisper of light on the card's top edge — the Linear "lit from above" hairline.
    topHighlight: 'rgba(255,255,255,0.06)',
    // Pale steel — luminous against deep space, but desaturated so it reads as instrument light,
    // not a candy blue. Spent sparingly: active rings, links, the one primary action.
    accent: '#99B2D1',
    accentText: '#0A0B0D',
    accentSubtle: '#181D24',
    accentTrack: '#2E3743',
    accentTrackMuted: '#191E23',
    accentTrackStrong: '#6B7C91',
    // See light note — an interactive control outline that clears ≥3:1 on the dark card.
    controlTrack: '#69737F',
    // Neutral cool steel — faint etched-telemetry lines against deep space. See light note.
    pattern: '#77828F',
    // Cool luminous moonlight — the moon glowing against deep space, and the completion silver.
    // A real moon reads cool silver-white, not warm; "done" is set apart by brightness + glow (it's
    // far brighter than the muted steel of in-progress), not by temperature.
    complete: '#E5EBF3',
    glow: '#EAEFF6',
    danger: '#FF5E63',
    dangerText: '#0A0B0D',
    dangerSubtle: '#2A1414',
    rippleOnFill: '#FFFFFF33',
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
  defaultBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: FontWeight.bold,
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
