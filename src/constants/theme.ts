/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#14162A', // deep indigo-charcoal (not pure black)
    textSecondary: '#5B6275', // cool slate, AA on white + cards
    background: '#FCFCFD', // clean near-white, faint cool tint
    backgroundElement: '#F1F2F7', // card / input surface
    backgroundSelected: '#E5E7F0', // pressed / divider / hairline fills
    border: '#E3E5EF', // subtle hairline borders
    accent: '#4C5BD4', // lunar indigo (AA as link/UI on white)
    accentText: '#FFFFFF', // text/icon on an accent fill
    accentSubtle: '#ECEDFB', // faint indigo tint (chart track, inactive dots)
    danger: '#C8323A', // error text + tinted-banner text
    dangerSubtle: '#FBE9E9', // tinted error-banner background
  },
  dark: {
    text: '#ECEEF6', // moonlight off-white (cool)
    textSecondary: '#969EB6',
    background: '#0B0E1A', // deep night-sky (indigo-black, not pure black)
    backgroundElement: '#141A2C', // lifted night-navy card
    backgroundSelected: '#1E2540',
    border: '#232B44',
    accent: '#7C84FF', // luminous periwinkle — glows on dark
    accentText: '#0B0E1A', // dark text on the light accent
    accentSubtle: '#1C2142',
    danger: '#FF767B',
    dangerSubtle: '#2A1417',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
