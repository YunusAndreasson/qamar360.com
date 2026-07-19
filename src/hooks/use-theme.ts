/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { usePreferences } from '@/hooks/use-preferences';

/**
 * The effective `'light' | 'dark'` scheme after applying the user's appearance preference:
 * an explicit choice wins, otherwise we follow the OS (null/undefined → light).
 */
export function useEffectiveScheme(): 'light' | 'dark' {
  const scheme = useColorScheme();
  const { themePreference } = usePreferences();
  if (themePreference === 'system') return scheme === 'dark' ? 'dark' : 'light';
  return themePreference;
}

export function useTheme() {
  return Colors[useEffectiveScheme()];
}
