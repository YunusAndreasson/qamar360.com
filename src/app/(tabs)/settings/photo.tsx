import { useLocalSearchParams, useRouter } from 'expo-router';

import { FormSheet, SheetActions } from '@/components/form-sheet';
import { ThemedText } from '@/components/themed-text';
import { useAvatar } from '@/hooks/use-avatar';

/**
 * The two things you can do to your account photo, behind the avatar at the head of Settings.
 *
 * A sheet rather than a pair of permanent rows: setting a photo is a once-ever action for most
 * people, and two rows spent on it would sit above the settings that are actually visited. The
 * avatar itself is the door — it is the only thing on the screen the photo *is*, so it is the
 * thing to press.
 *
 * The subtitle is a fact, not reassurance. The bucket is private and its policies key on the
 * owner's uid (see the avatar migration), so "nobody else can see it" is the literal shape of the
 * storage, and it is worth saying on the one screen that uploads anything at all.
 */
export default function PhotoSheet() {
  const router = useRouter();
  // The key the screen behind already read — see `useAvatar`'s `seedPath`. An empty string is what
  // a router param carries for "no photo", so it is normalised back to `null` here.
  const { path: seed } = useLocalSearchParams<{ path?: string }>();
  const { path, busy, error, choose, remove } = useAvatar(seed || null);

  // Dismiss only on a change. Backing out of the system picker resolves `false`, and closing the
  // sheet under someone who just decided not to pick would read as the app doing something.
  const run = (action: () => Promise<boolean>) => {
    void action().then((changed) => {
      if (changed) router.back();
    });
  };

  return (
    <FormSheet title="Your photo" subtitle="Shown at the top of Settings. Nobody else can see it.">
      <SheetActions
        actions={[
          {
            icon: 'photo',
            label: path ? 'Choose a different photo' : 'Choose a photo',
            onPress: () => run(choose),
          },
          path ? { icon: 'delete', label: 'Remove photo', danger: true, onPress: () => run(remove) } : null,
        ]}
      />
      {/* The upload is the one thing here that takes long enough to doubt. It replaces the error
          line rather than sitting beside it — while a request is in flight the previous failure is
          no longer the news. */}
      {busy ? (
        <ThemedText type="small" themeColor="textSecondary">
          Saving…
        </ThemedText>
      ) : error ? (
        <ThemedText type="small" themeColor="danger">
          {error}
        </ThemedText>
      ) : null}
    </FormSheet>
  );
}
