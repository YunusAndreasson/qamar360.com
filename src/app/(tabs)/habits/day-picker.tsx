import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { FormSheet } from '@/components/form-sheet';
import { MoonCalendar } from '@/components/moon-calendar';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Pressed } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { DATE_LOCALE, hijriParts } from '@/lib/dates';

/**
 * Which day the list is showing — a sheet, not a strip.
 *
 * The day used to be switched from a permanent row at the top of Today: two chevrons, the date,
 * and a "Back to today" line under them, all of it standing above the practice on every single
 * day the user is simply on today. Backfilling is occasional, so it now costs one tap from the
 * calendar in the header and nothing at all the rest of the time.
 *
 * **The subtitle is the Hijri date, and only that.** The grid below counts in Gregorian, with each
 * day's moon beneath its number ({@link MoonCalendar}), so the two calendars meet on it. The
 * subtitle names the picked day in the one the rest of the app reckons in: the months Progress is
 * filed under, a habit scheduled on a Hijri day. It falls back to the full Gregorian date on a
 * runtime whose `Intl` has no Islamic calendar, so the line is never empty.
 *
 * `viewDate` lives in `HabitsProvider` at the (tabs) root, so this sheet writes the same state
 * the list reads: no params to hand back, and the day behind the sheet changes as it is picked.
 */
export default function DayPickerScreen() {
  const router = useRouter();
  const { viewDate, today, minViewDate, setViewDate } = useHabits();
  const fullDate = new Date(`${viewDate}T12:00:00`).toLocaleDateString(DATE_LOCALE, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const hijri = hijriParts(viewDate);
  const subtitle = hijri ? `${hijri.day} ${hijri.monthName} ${hijri.year}` : fullDate;
  // A pick is a CHANGE of day: tapping the day already shown is a non-event, and leaves the sheet
  // open rather than closing it on nothing.
  const choose = (iso: string) => {
    if (iso === viewDate) return;
    setViewDate(iso);
    router.back();
  };
  return (
    <FormSheet title="Choose a day" subtitle={subtitle}>
      {/* Above the calendar, not below it. Only off today: on today it would be a button that does
          nothing, and the grid already marks the day you are on. The one control here that must
          never need to be scrolled to is the one that undoes being lost in the past. */}
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
      <Surface>
        <MoonCalendar value={viewDate} today={today} min={minViewDate} max={today} onChange={choose} />
      </Surface>
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  today: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: Pressed.dim },
});
