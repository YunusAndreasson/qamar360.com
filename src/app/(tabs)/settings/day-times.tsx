import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { FormSheet } from '@/components/form-sheet';
import { Segmented, type SegmentedOption } from '@/components/segmented';
import { ThemedText } from '@/components/themed-text';
import { TimeChip } from '@/components/time-chip';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { todayLocalISO } from '@/lib/dates';
import { deviceLocation } from '@/lib/geo';
import { MOMENTS } from '@/lib/moments';
import { setPreference, usePreference } from '@/lib/preferences';
import { DAY_PARTS, solarBands, type DayBands, type DayPart } from '@/lib/sun';

type Source = 'sun' | 'custom';

const SOURCES: SegmentedOption<Source>[] = [
  { value: 'sun', label: 'The sun', icon: 'sunrise', accessibilityLabel: 'Follow the sun' },
  { value: 'custom', label: 'My times', icon: 'moon', accessibilityLabel: 'My own times' },
];

/** Chapters can't cross: each start stays this far behind the next one, and ahead of the last. */
const MIN_GAP = 30;

/** Clamp a newly-picked start so the four chapters stay in order and none collapses. */
function withBoundary(bands: DayBands, part: DayPart, minutes: number): DayBands {
  const order: DayPart[] = [...DAY_PARTS];
  const index = order.indexOf(part);
  const previous = index > 0 ? bands[order[index - 1] as DayPart] + MIN_GAP : 0;
  const next = index < order.length - 1 ? bands[order[index + 1] as DayPart] - MIN_GAP : 24 * 60 - MIN_GAP;
  return { ...bands, [part]: Math.min(Math.max(minutes, previous), next) };
}

/**
 * Times of day — where each chapter of the day begins.
 *
 * By default the app reads them off the real sun (civil dawn, solar noon, the sun leaving its
 * high band, civil dusk), which is true but not always *yours*: a person's morning starts when
 * they get up. Switching to "My times" seeds the four boundaries from today's actual solar ones,
 * so the switch itself changes nothing on screen — only the edits that follow do.
 *
 * The chapters are what light a stack on the Today screen and what its "until" caption counts
 * down to. The Hijri date is deliberately not among them: it turns at the real Maghrib whatever
 * is chosen here, because that one is a fact about the sky rather than a preference.
 */
export default function DayTimesScreen() {
  const theme = useTheme();
  const bands = usePreference('dayBands');
  const source: Source = bands ? 'custom' : 'sun';

  const onSource = (value: Source) => {
    if (value === 'sun') {
      setPreference('dayBands', null);
      return;
    }
    const { lat, lon } = deviceLocation();
    setPreference('dayBands', solarBands(todayLocalISO(), lat, lon));
  };

  return (
    <FormSheet title="Times of day" subtitle="When each chapter of your day begins">
      <Segmented options={SOURCES} value={source} onChange={onSource} />

      {bands ? (
        <View style={styles.bands}>
          {DAY_PARTS.map((part) => (
            // A column, not a row: on iOS the chip reveals its spinner directly beneath itself,
            // which needs the full sheet width to lay out.
            <View key={part} style={styles.band}>
              <View style={styles.bandHead}>
                <AppIcon name={MOMENTS[part].icon} color={theme.textSecondary} />
                <ThemedText type="rowTitle">{MOMENTS[part].label} begins</ThemedText>
              </View>
              <TimeChip
                minutes={bands[part]}
                onChange={(minutes) => setPreference('dayBands', withBoundary(bands, part, minutes))}
                accessibilityLabel={`${MOMENTS[part].label} begins at`}
              />
            </View>
          ))}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          Morning opens at first light, midday at the sun’s peak, evening as it falls, night at
          dusk — measured where you are, so they move with the season.
        </ThemedText>
      )}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  bands: { gap: Spacing.three, paddingHorizontal: Spacing.one },
  band: { gap: Spacing.one },
  bandHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  note: { paddingHorizontal: Spacing.one, paddingBottom: Spacing.two },
});
