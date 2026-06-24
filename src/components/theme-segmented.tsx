import { SegmentedControl } from '@expo/ui/community/segmented-control';

import { usePreferences, type ThemePreference } from '@/hooks/use-preferences';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Light / Dark / System appearance switch, wired to the persisted preference.
 *
 * A native segmented control (`UISegmentedControl` on iOS, Material on Android,
 * vendored on web) via `@expo/ui` — no hand-rolled track/segment styling. `appearance`
 * forces its light/dark look to the *effective* scheme so a forced theme override still
 * matches; `tintColor` carries the accent on the platforms that honor it (iOS uses the
 * system selected-segment style).
 */
export function ThemeSegmented() {
  const theme = useTheme();
  const scheme = useEffectiveScheme();
  const { themePreference, setThemePreference } = usePreferences();
  const selectedIndex = Math.max(0, OPTIONS.findIndex((o) => o.value === themePreference));

  return (
    <SegmentedControl
      values={OPTIONS.map((o) => o.label)}
      selectedIndex={selectedIndex}
      onChange={({ nativeEvent: { selectedSegmentIndex } }) => {
        const next = OPTIONS[selectedSegmentIndex];
        if (!next || next.value === themePreference) return;
        haptics.selection();
        setThemePreference(next.value);
      }}
      tintColor={theme.accent}
      appearance={scheme}
    />
  );
}
