import { StyleSheet, View } from 'react-native';

import { MoonPhase } from '@/components/moon-phase';
import { MoonHalo } from '@/components/ornament/moon-halo';

/**
 * The empty-state brand mark: a young waxing crescent cradled in the signature octagram halo —
 * the same "the moon generates the order" motif as sign-in and the Progress hero, sized down. A
 * warm, on-brand stand-in for a flat placeholder glyph: it says "this is where your moons begin"
 * rather than "there is nothing here". Shared so the first-run (Today) and no-data (Progress)
 * states read as one family.
 */
export function MoonEmblem() {
  return (
    <View style={styles.frame}>
      <MoonHalo size={SIZE} strokeOpacity={0.16} />
      <MoonPhase illumination={0.42} waxing size={SIZE * 0.46} />
    </View>
  );
}

/** One size, because there is one mark. Both empty states show it at the same scale — that is
 *  the point of sharing it, and a size knob neither of them turned was a promise of variation
 *  the family doesn't want. */
const SIZE = 104;

const styles = StyleSheet.create({
  frame: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
});
