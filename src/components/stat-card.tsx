import { StyleSheet, View } from 'react-native';

import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';

import type { ViewProps } from 'react-native';

/**
 * Rounded surface card (Apple Health style) used to group a stat and its label.
 * Wraps the app's `backgroundElement` so cards read consistently in light/dark. These are the
 * app's hero/grouping cards, so they carry the faint flower-of-life watermark by default
 * (pass `pattern={false}` to opt out).
 */
export function StatCard({
  style,
  pattern = true,
  patternVariant,
  ...rest
}: ViewProps & { pattern?: boolean; patternVariant?: 'card' | 'hero' }) {
  return <Surface padded pattern={pattern} patternVariant={patternVariant} style={style} {...rest} />;
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
