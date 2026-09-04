import { DateTimePicker, type DateTimePickerProps } from '@expo/ui/community/datetime-picker';

import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';

/** Keep picker colors aligned with the app's appearance override. */
export function NativeDatePicker(props: Omit<DateTimePickerProps, 'onChange'>) {
  const theme = useTheme();
  const scheme = useEffectiveScheme();
  return <DateTimePicker accentColor={theme.accent} themeVariant={scheme} {...props} />;
}
