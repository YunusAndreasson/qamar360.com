/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { usePreference } from '@/lib/preferences';

/**
 * The effective `'light' | 'dark'` scheme after applying the user's appearance preference:
 * an explicit choice wins, otherwise we follow the OS (null/undefined → light).
 */
export function useEffectiveScheme(): 'light' | 'dark' {
  const scheme = useColorScheme();
  const appearance = usePreference('appearance');
  if (appearance === 'system') return scheme === 'dark' ? 'dark' : 'light';
  return appearance;
}

export function useTheme() {
  return Colors[useEffectiveScheme()];
}
