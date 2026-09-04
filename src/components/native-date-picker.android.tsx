import { DatePickerDialog, Host, TimePickerDialog } from '@expo/ui/jetpack-compose';

import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';
import { fromPickerDate, toPickerDate } from '@/lib/calendar-picker';

import type { DateTimePickerProps } from '@expo/ui/community/datetime-picker';

/** Explicit Host appearance keeps native dialogs in sync with the app override. */
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
    onDismissRequest: () => onDismiss?.(),
  };
  return (
    <Host colorScheme={scheme}>
      {mode === 'time' ? <TimePickerDialog {...shared} is24Hour={is24Hour} /> : (
        <DatePickerDialog {...shared} variant={display === 'spinner' ? 'input' : 'picker'}
          selectableDates={{ start: minimumDate, end: maximumDate }} />
      )}
    </Host>
  );
}
