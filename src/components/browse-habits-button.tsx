import { useRouter } from 'expo-router';

import { AppButton } from '@/components/app-button';

/**
 * The shared "Browse habits" call-to-action — opens the curated Sunnah library (Discover). Lives
 * in one place so the Today and Progress empty states never drift in label or destination (they
 * once read "Browse habits" vs "Browse Sunnah habits"). `navigate` works from either tab: it opens
 * Discover in the Today stack, switching tabs first when tapped from Progress.
 */
export function BrowseHabitsButton() {
  const router = useRouter();
  return (
    <AppButton onPress={() => router.navigate('/habits/discover')} accessibilityLabel="Browse habits">
      Browse habits
    </AppButton>
  );
}
