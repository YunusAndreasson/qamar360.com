import { Segmented, type SegmentedOption } from '@/components/segmented';
import { setPreference, usePreference, type ThemePreference } from '@/lib/preferences';

// Sun / moon / auto carry the meaning at a glance and tie the control to the app's
// lunar theme, so it reads as ours rather than a stock platform widget.
const OPTIONS: SegmentedOption<ThemePreference>[] = [
  { value: 'system', label: 'System', icon: 'appearanceAuto', accessibilityLabel: 'System appearance' },
  { value: 'light', label: 'Light', icon: 'sun', accessibilityLabel: 'Light appearance' },
  { value: 'dark', label: 'Dark', icon: 'moon', accessibilityLabel: 'Dark appearance' },
];

/** Appearance selector — the shared {@link Segmented} control over the theme preference. */
export function ThemeSegmented() {
  const appearance = usePreference('appearance');
  return <Segmented options={OPTIONS} value={appearance} onChange={(value) => setPreference('appearance', value)} />;
}
