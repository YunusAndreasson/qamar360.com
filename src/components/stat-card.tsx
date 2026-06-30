import { StyleSheet, View } from 'react-native';

import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';

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
  // A stat card's `style` is content rhythm (the card gap), so it rides the inner content layer —
  // the outer card keeps the elevation shadow.
  return <Surface padded pattern={pattern} patternVariant={patternVariant} contentStyle={style} {...rest} />;
}

/**
 * The shared header for a stat card: a sentence-case title on the left and an optional
 * muted caption on the right, baseline-aligned. One definition so every stat card on the
 * Progress screen carries the same title weight, size, and rhythm.
 */
export function StatCardHeader({ title, trailing }: { title: string; trailing?: string }) {
  return (
    <View style={styles.header}>
      <ThemedText type="defaultSemiBold" style={styles.title}>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' },
  title: { flex: 1 },
});
