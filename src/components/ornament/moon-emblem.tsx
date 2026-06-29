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
export function MoonEmblem({ size = 104 }: { size?: number }) {
  return (
    <View style={[styles.frame, { width: size, height: size }]}>
      <MoonHalo size={size} strokeOpacity={0.16} />
      <MoonPhase illumination={0.42} waxing size={size * 0.46} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
});
