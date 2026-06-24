import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { stackHeaderOptions } from '@/lib/header-options';

/** The Progress tab's native Stack — large title that collapses on scroll. */
export default function ProgressStackLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={stackHeaderOptions(theme)}>
      <Stack.Screen name="index" options={{ title: 'Progress', headerLargeTitle: true }} />
    </Stack>
  );
}
