import { useRouter } from 'expo-router';

import { AppButton } from '@/components/app-button';

/**
 * The shared "start here" call-to-action — opens the library of ready-made stacks. It points at
 * the stacks rather than the raw catalog because an act needs an anchor before it needs a name:
 * someone with nothing yet is better served by "Fajr — these four things" than by a list of
 * ninety habits and no home to put them in. Lives in one place so every empty state agrees on the
 * label and the destination. `navigate` works from either tab: it opens the library in the Today
 * stack, switching tabs first when tapped from Progress.
 */
export function BrowseHabitsButton() {
  const router = useRouter();
  return (
    <AppButton onPress={() => router.navigate('/habits/stack-library')} accessibilityLabel="Choose an anchor">
      Choose an anchor
    </AppButton>
  );
}
