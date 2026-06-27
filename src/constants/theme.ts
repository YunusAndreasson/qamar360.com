/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform, type TextStyle } from 'react-native';

export const Colors = {
  // "Moonlight" — silver dawn. A unified cool, blue-violet neutral ramp so light and
  // dark read as the same lunar world at different hours. `accent` is the moonlight itself
  // (it paints the lit moon disc in moon-phase.tsx and every progress ring).
  light: {
    text: '#131826',
    textSecondary: '#4E5A6F',
    textDisabled: '#7E889B',
    // Cards sit a clear tonal step below the page (Material 3 surface-container model)
    // so a grouped surface reads as lifted, not as a faint tint of the background.
    background: '#F5F7FB',
    backgroundElement: '#E6EAF3',
    backgroundSelected: '#D7DDEC',
    border: '#C5CDDE',
    accent: '#4C57C9',
    accentText: '#FFFFFF',
    accentSubtle: '#E7E9FB',
    // Progress tracks/empty states must stay perceivable on the card (≥~3:1 non-text
    // contrast) — the old pale-lavender tracks vanished against the silver-dawn surface.
    accentTrack: '#C2C8EA',
    accentTrackMuted: '#D2D7EF',
    accentTrackStrong: '#A9B1EC',
    // Hairline color for the geometric ornament layer (flower-of-life texture, moon-halo).
    // An accent-leaning indigo so the ornament reads as "moonlight", not grey — only ever
    // drawn at low opacity (see src/components/ornament/*).
    pattern: '#3A4796',
    success: '#157A5E',
    successSubtle: '#DCEFE9',
    // The "full moon" reward — a day/month that reaches 100%. Reserved for completion
    // *visuals* (filled moon disc, closed orbit, full day bar), never for text. A deeper
    // antique gold here so it stays legible on the light silver-dawn background.
    complete: '#B5862A',
    danger: '#B4232A',
    dangerText: '#FFFFFF',
    dangerSubtle: '#FAE8EC',
    rippleOnFill: '#FFFFFF33',
  },
  // "Moonlight" — night sky. `background` stays the brand #10131B so the native splash
  // (app.json) and icon flow seamlessly into the first app frame.
  dark: {
    text: '#EEF0F8',
    textSecondary: '#A6AFC2',
    textDisabled: '#7B8398',
    background: '#10131B',
    backgroundElement: '#1A1F2A',
    backgroundSelected: '#252B38',
    border: '#303747',
    accent: '#9AA0FF',
    accentText: '#10131B',
    accentSubtle: '#262B5C',
    accentTrack: '#353B80',
    accentTrackMuted: '#242957',
    accentTrackStrong: '#4E57C2',
    // Pale periwinkle — faint etched-constellation lines against the night sky. See light note.
    pattern: '#AEB6FF',
    success: '#57D2A2',
    successSubtle: '#143430',
    // Pale moon-gold — glows against the night sky when a day/month is fully complete.
    complete: '#E8C879',
    danger: '#FF8B8E',
    dangerText: '#10131B',
    dangerSubtle: '#381B22',
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
  },
  smallCompactBold: {
    fontSize: 14,
    lineHeight: 16,
    fontWeight: FontWeight.bold,
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
  card: 16,
} as const;

/** Press-state opacity. `dim` for filled rows/cards/buttons; `glyph` for bare icon buttons. */
export const Pressed = { dim: 0.6, glyph: 0.4 } as const;

/** Opacity for a control disabled by dimming (rather than a colour swap, as `AppButton` does). */
export const Disabled = 0.4;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
