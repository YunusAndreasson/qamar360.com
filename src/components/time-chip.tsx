import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A time of day as minutes from local midnight — the currency the day bands are stored in. */
function minutesToDate(minutes: number): Date {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

/** Locale-formatted for display — 09:00 or 9:00 AM, whichever the device speaks. */
function formatMinutes(minutes: number): string {
  return minutesToDate(minutes).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/**
 * A tappable chip showing a time, which opens the platform's time picker — the app's single
 * time-of-day control, used by the custom day-part boundaries.
 *
 * Per-platform by the library's own recommendation (`@react-native-community/datetimepicker`
 * v9): iOS renders the spinner inline (revealed under the chip, with its own Done), Android
 * opens the native dialog imperatively. Silent on press — the haptic vocabulary never buzzes
 * for opening a picker; the committed value is what matters.
 */
export function TimeChip({
  minutes,
  onChange,
  accessibilityLabel,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  const [spinnerVisible, setSpinnerVisible] = useState(false);
  const value = minutesToDate(minutes);

  const commit = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === 'set' && date) onChange(date.getHours() * 60 + date.getMinutes());
  };

  const open = () => {
    if (Platform.OS === 'android') DateTimePickerAndroid.open({ value, mode: 'time', onChange: commit });
    else setSpinnerVisible((v) => !v);
  };

  return (
    <>
      <PressableScale
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ text: formatMinutes(minutes) }}
        style={[styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText type="smallBold">{formatMinutes(minutes)}</ThemedText>
      </PressableScale>
      {spinnerVisible && Platform.OS === 'ios' ? (
        <View>
          <DateTimePicker value={value} mode="time" display="spinner" onChange={commit} />
          <PressableScale onPress={() => setSpinnerVisible(false)} style={styles.done} accessibilityRole="button">
            <ThemedText type="smallBold" themeColor="accent">
              Done
            </ThemedText>
          </PressableScale>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    minHeight: 44, // the app's minimum tap target
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  done: { alignSelf: 'center', paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
});
