import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Duration } from '@/constants/motion';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** One size, because there is one of these — the mark at the head of Settings. A size knob nothing
 *  turned would be a promise of variation the screen doesn't want (the same reasoning as
 *  {@link MoonEmblem}). */
const SIZE = 56;

/**
 * Who the account belongs to: the user's photo, or the initial of their email until they set one.
 *
 * The monogram is not a placeholder waiting to be replaced — it is a complete answer, and the one
 * every account starts and can return to. So the frame is identical either way (same circle, same
 * `accentSubtle` ground), and setting a photo changes what is inside it rather than turning an
 * empty slot into a filled one.
 *
 * `cacheKey` is the storage key rather than the URL, because the URL is a signed one that is
 * re-minted on a new session — see `use-avatar.ts`. Keyed on the object, the photo is drawn from
 * disk on the next launch instead of downloaded again behind a URL the cache has never seen.
 */
export function Avatar({ url, cacheKey, monogram }: { url: string | null; cacheKey: string | null; monogram: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.frame, { backgroundColor: theme.accentSubtle }]}>
      {url ? (
        <Image
          source={{ uri: url, cacheKey: cacheKey ?? undefined }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          // A photo still on its way in fades up rather than popping; one already on disk paints
          // at once, so the cached-launch case above never replays the fade.
          transition={{ duration: Duration.base, skipOnCacheHit: 'all' }}
          // Hidden from the accessibility tree: the name and email beside it already say whose
          // account this is, and the button around it says what the photo is for.
          accessible={false}
        />
      ) : (
        <ThemedText type="subtitle" themeColor="accent">
          {monogram}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: SIZE,
    height: SIZE,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    // The photo fills the circle, so it has to be clipped by it.
    overflow: 'hidden',
  },
});
