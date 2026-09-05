import { DatePickerDialog, DateTimePicker, Host, TimePickerDialog } from '@expo/ui/jetpack-compose';
import { StyleSheet } from 'react-native';

import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { fromPickerDate, toPickerDate } from '@/lib/calendar-picker';

import type { DateTimePickerProps } from '@expo/ui/community/datetime-picker';

/**
 * Explicit Host appearance keeps native pickers in sync with the app override.
 *
 * `display` picks the *shape*, exactly as it does on iOS: `inline` draws the Material 3 calendar
 * in place, anything else raises the OS dialog. The dialog is right for a chip that has to give a
 * field back its value; it is wrong for a screen that is already a sheet about picking a date,
 * because it covers that sheet completely — heading, subtitle and all — and the sheet then has no
 * way to say anything about the day being chosen.
 */
export function NativeDatePicker({ value, mode, minimumDate, maximumDate, onValueChange, onDismiss, display, is24Hour }: Omit<DateTimePickerProps, 'onChange'>) {
  const theme = useTheme();
  const scheme = useEffectiveScheme();
  const onDateSelected = (selected: Date) => {
    const date = mode === 'time' ? selected : fromPickerDate(selected);
    onValueChange?.({
      nativeEvent: { timestamp: date.getTime(), utcOffset: -date.getTimezoneOffset() },
    }, date);
  };
  const shared = {
    initialDate: (mode === 'time' ? value : toPickerDate(value)).toISOString(),
    color: theme.accent,
    onDateSelected,
  };
  const selectableDates = { start: minimumDate, end: maximumDate };

  // In place, at an explicit size — NOT `matchContents`.
  //
  // Letting the Host measure from its content proposes an unbounded width to Compose, and the
  // Material 3 date picker contains a horizontally scrolling row: an infinite width constraint is
  // a hard `IllegalStateException` there ("Horizontally scrollable component was measured with an
  // infinity maximum width"), which takes the whole app down. Constraining only the width did not
  // help — the Host still measures its Compose child through a `wrap_content` LinearLayout — so
  // the size is given outright and Compose lays out inside it.
  //
  // {@link CALENDAR_HEIGHT} is what the Material 3 date picker asks for: a headline, the month
  // navigation row, the weekday letters and six week rows. It is fixed because a month grid is a
  // fixed shape — the six rows are always drawn, whether or not the month fills them.
  if (mode !== 'time' && display === 'inline') {
    return (
      <Host style={styles.inline} colorScheme={scheme}>
        {/* No variant toggle: the sheet offers one way to pick a day, and the keyboard-entry
            variant would put a text field inside a card that is already a calendar.

            The container is painted the app's own card colour rather than Material's surface,
            because in place it IS on a card: left at the M3 default it read as a lighter grey box
            floating inside the plate holding it. The other four keys are the ones `color` would
            have set on its own — `elementColors` takes precedence over it, so anything the accent
            should still reach has to be named here. */}
        <DateTimePicker
          {...shared}
          showVariantToggle={false}
          selectableDates={selectableDates}
          elementColors={{
            containerColor: theme.backgroundElement,
            headlineContentColor: theme.accent,
            selectedDayContainerColor: theme.accent,
            selectedDayContentColor: theme.background,
            todayDateBorderColor: theme.accent,
          }}
        />
      </Host>
    );
  }
  const dialog = { ...shared, onDismissRequest: () => onDismiss?.() };
  return (
    <Host colorScheme={scheme}>
      {mode === 'time' ? <TimePickerDialog {...dialog} is24Hour={is24Hour} /> : (
        <DatePickerDialog {...dialog} variant={display === 'spinner' ? 'input' : 'picker'}
          selectableDates={selectableDates} />
      )}
    </Host>
  );
}

/** Material 3's date picker, in dp: headline + month row + weekday letters + six week rows. */
const CALENDAR_HEIGHT = 480;

const styles = StyleSheet.create({ inline: { width: '100%', height: CALENDAR_HEIGHT } });
