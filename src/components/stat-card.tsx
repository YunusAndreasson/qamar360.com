import { StyleSheet, View } from 'react-native';

import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import type { ViewProps } from 'react-native';

/**
 * Rounded surface card (Apple Health style) used to group a stat and its label.
 * Wraps the app's `backgroundElement` so cards read consistently in light/dark. Plain stat
 * cards stay clean (the sky shows behind them); only the Progress moon hero opts in via
 * `pattern patternVariant="hero"` for the seed-of-life that blends with the moon.
 */
export function StatCard({
  style,
  pattern = false,
  patternVariant,
  ...rest
}: ViewProps & { pattern?: boolean; patternVariant?: 'card' | 'hero' }) {
  // A stat card's `style` is content rhythm, so it rides the inner content layer — the outer card
  // keeps the elevation shadow. One shared header→content gap so every Progress stat card reads
  // with the same rhythm (callers used to each re-declare it); an override can still be passed.
  return (
    <Surface padded pattern={pattern} patternVariant={patternVariant} contentStyle={[styles.card, style]} {...rest} />
  );
}

/**
 * The shared header for a stat card: a sentence-case title on the left and an optional
 * muted caption on the right, baseline-aligned. One definition so every stat card on the
 * Progress screen carries the same title weight, size, and rhythm.
 */
export function StatCardHeader({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <View style={styles.header}>
      <ThemedText type="heading" style={styles.title}>
        {title}
      </ThemedText>
      {trailing ? (
        <ThemedText type="small" themeColor="textSecondary">
          {trailing}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // One card gap across all Progress stat cards, so their header→content rhythm reads identically.
  card: { gap: Spacing.three },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' },
  title: { flex: 1 },
});
