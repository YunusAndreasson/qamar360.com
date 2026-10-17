import { useId } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { SelectablePill } from '@/components/selectable-pill';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

export type Filter = { id: string; label: string };

type Props = {
  filters: Filter[];
  active: string;
  onChange: (id: string) => void;
};

/** Width of the right-edge dissolve that signals "more chips this way". */
const FADE_W = 24;

/**
 * Horizontal category jump/filter for Discover — overview + fast navigation over a long
 * library, so the user never has to scroll-and-scan for a section. Built on the shared
 * {@link SelectablePill}; the active filter ANDs with the search text. The right edge fades
 * the last chip out instead of hard-clipping it mid-letter — the dissolve is the scroll cue.
 */
export function DiscoverFilterChips({ filters, active, onChange }: Props) {
  const theme = useTheme();
  const fadeId = `chip-fade-${useId()}`;
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        {filters.map((f) => {
          const selected = f.id === active;
          return (
            <SelectablePill
              key={f.id}
              selected={selected}
              label={f.label}
              // Plain Pressable (no Reanimated scale): these pinned chips otherwise get hoisted into
              // the native-stack transition overlay and "fly" over the header on push/pop.
              noScale
              onPress={() => {
                if (f.id === active) return;
                haptics.selection();
                onChange(f.id);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${f.label} filter`}
              style={styles.chip}
            />
          );
        })}
      </ScrollView>
      {/* The dissolve — page colour ramping over the clipped chip. Non-interactive. */}
      <View pointerEvents="none" style={styles.fade}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={theme.background} stopOpacity="0" />
              <Stop offset="1" stopColor={theme.background} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect width="100" height="100" fill={`url(#${fadeId})`} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  chip: { minHeight: 44 },
  fade: { position: 'absolute', top: 0, bottom: 0, right: 0, width: FADE_W },
});
