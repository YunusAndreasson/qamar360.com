import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { NativeDatePicker } from '@/components/native-date-picker';
import { PressableScale } from '@/components/pressable-scale';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Native time selection with a compact trigger. */
function minutesToDate(minutes: number): Date {
  const date = new Date();
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

/** Locale-formatted for display — 09:00 or 9:00 AM, whichever the device speaks. */
function formatMinutes(minutes: number): string {
  return minutesToDate(minutes).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Shared time-of-day control: an Android dialog or an inline iOS picker. */
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

  const commit = (_event: unknown, date: Date) => {
    onChange(date.getHours() * 60 + date.getMinutes());
    if (Platform.OS === 'android') setSpinnerVisible(false);
  };

  const open = () => setSpinnerVisible((value) => !value);

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
      {spinnerVisible ? (
        <View>
          <NativeDatePicker value={value} mode="time" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onValueChange={commit} onDismiss={() => setSpinnerVisible(false)} />
          {Platform.OS === 'ios' ? <PressableScale onPress={() => setSpinnerVisible(false)} style={styles.done} accessibilityRole="button">
            <ThemedText type="smallBold" themeColor="accent">
              Done
            </ThemedText>
          </PressableScale> : null}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    minHeight: 48, // the app's minimum tap target
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  done: { minHeight: 48, justifyContent: 'center', alignSelf: 'center', paddingVertical: Spacing.two, paddingHorizontal: Spacing.three },
});
