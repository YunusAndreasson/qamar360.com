import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { NativeDatePicker } from '@/components/native-date-picker';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Pressed, Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { todayLocalISO } from '@/lib/dates';

/**
 * Which day the list is showing — a sheet, not a strip.
 *
 * The day used to be switched from a permanent row at the top of Today: two chevrons, the date,
 * and a "Back to today" line under them, all of it standing above the practice on every single
 * day the user is simply on today. Backfilling is occasional, so it now costs one tap from the
 * header's calendar glyph and nothing at all the rest of the time.
 *
 * The subtitle carries the full date the large title abbreviates ("Today", "Yesterday",
 * "Saturday") — that reading was the one thing worth keeping from the strip.
 *
 * `viewDate` lives in `HabitsProvider` at the (tabs) root, so this sheet writes the same state
 * the list reads: no params to hand back, and the day behind the sheet changes as it is picked.
 */
export default function DayPickerScreen() {
  const router = useRouter();
  const { viewDate, today, minViewDate, setViewDate } = useHabits();
  const value = new Date(`${viewDate}T12:00:00`);
  const fullDate = value.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const choose = (iso: string) => {
    setViewDate(iso);
    router.back();
  };
  return (
    <FormSheet title="Choose a day" subtitle={fullDate}>
      <Surface contentStyle={styles.plate}>
        <NativeDatePicker
          value={value}
          minimumDate={new Date(`${minViewDate}T00:00:00`)}
          maximumDate={new Date(`${today}T23:59:59`)}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onValueChange={(_event, next) => choose(todayLocalISO(next))}
        />
      </Surface>
      {/* Only off today: on today it would be a button that does nothing, and the calendar
          already marks the day you are on. */}
      {viewDate !== today ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => choose(today)}
          style={({ pressed }) => [styles.today, pressed && styles.pressed]}>
          <ThemedText type="smallBold" themeColor="accent">
            Back to today
          </ThemedText>
        </Pressable>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  // The picker paints its own month grid; the plate only has to hold it off the card edges.
  plate: { padding: Spacing.two },
  today: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: Pressed.dim },
});
