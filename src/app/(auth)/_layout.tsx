import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function AuthLayout() {
  const theme = useTheme();
  // No header here, but still theme the screen background so the auth screen never flashes
  // the navigator's default (white) behind it — parity with the other stacks.
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.background } }} />
  );
}
