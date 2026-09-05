import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { NativeDatePicker } from '@/components/native-date-picker';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Pressed } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { hijriParts, todayLocalISO } from '@/lib/dates';

/**
 * Which day the list is showing — a sheet, not a strip.
 *
 * The day used to be switched from a permanent row at the top of Today: two chevrons, the date,
 * and a "Back to today" line under them, all of it standing above the practice on every single
 * day the user is simply on today. Backfilling is occasional, so it now costs one tap from the
 * moon in the header and nothing at all the rest of the time.
 *
 * **The subtitle is the Hijri date, and only that.** The grid below is the OS's own, so it counts
 * in Gregorian and always will — it names the month, circles the day, and on Android prints the
 * full date in its headline. What it cannot say is the day in the calendar the rest of the app
 * reckons in: the moon on the button that opens this sheet, the months Progress and Insights are
 * filed under, a habit scheduled on a Hijri day. So the sheet says that, and the two calendars
 * are stated once each rather than the Gregorian one twice. It falls back to the full Gregorian
 * date on a runtime whose `Intl` has no Islamic calendar, so the line is never empty.
 *
 * `viewDate` lives in `HabitsProvider` at the (tabs) root, so this sheet writes the same state
 * the list reads: no params to hand back, and the day behind the sheet changes as it is picked.
 */
export default function DayPickerScreen() {
  const router = useRouter();
  const { viewDate, today, minViewDate, setViewDate } = useHabits();
  const value = new Date(`${viewDate}T12:00:00`);
  const fullDate = value.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const hijri = hijriParts(viewDate);
  const subtitle = hijri ? `${hijri.day} ${hijri.monthName} ${hijri.year}` : fullDate;
  // A pick is a CHANGE of day. The guard is not defensive tidiness: Android's in-place Material
  // picker reports its initial date the moment it lays out, so without it the sheet chose the day
  // it opened on and dismissed itself in the same frame — it could not be opened at all. Tapping
  // the day already shown is the same non-event, and is treated the same way.
  const choose = (iso: string) => {
    if (iso === viewDate) return;
    setViewDate(iso);
    router.back();
  };
  return (
    <FormSheet title="Choose a day" subtitle={subtitle}>
      {/* Above the calendar, not below it. Only off today: on today it would be a button that does
          nothing, and the grid already marks the day you are on. A month grid is 500-odd points
          tall, so anything under it is off the bottom of the sheet — the one control here that
          must never need to be scrolled to is the one that undoes being lost in the past. */}
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
      {/* No `padded`: the picker paints its own month grid with Material's own insets around it,
          and it is given the card's colour so the two read as one surface. A ring of padding on
          top of that was points of nothing, on the one sheet in the app with none to spare. */}
      <Surface>
        <NativeDatePicker
          value={value}
          minimumDate={new Date(`${minViewDate}T00:00:00`)}
          maximumDate={new Date(`${today}T23:59:59`)}
          // In place on both platforms, so the heading and the Hijri line above stay readable
          // while the day is chosen — an Android dialog would cover the sheet that carries them.
          display="inline"
          onValueChange={(_event, next) => choose(todayLocalISO(next))}
        />
      </Surface>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  today: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: Pressed.dim },
});
