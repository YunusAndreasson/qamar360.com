import { ScrollView, StyleSheet } from 'react-native';

import { SelectablePill } from '@/components/selectable-pill';
import { Spacing } from '@/constants/theme';
import { haptics } from '@/lib/haptics';

export type Filter = { id: string; label: string };

type Props = {
  filters: Filter[];
  active: string;
  onChange: (id: string) => void;
};

/**
 * Horizontal category jump/filter for Discover — overview + fast navigation over a long
 * library, so the user never has to scroll-and-scan for a section. Built on the shared
 * {@link SelectablePill}; the active filter ANDs with the search text.
 */
export function DiscoverFilterChips({ filters, active, onChange }: Props) {
  return (
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
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  chip: { minHeight: 44 },
});
