import { StyleSheet, View } from 'react-native';

import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import type { ReactNode } from 'react';
import type { ViewProps } from 'react-native';

/**
 * Rounded surface card (Apple Health style) used to group a stat and its label.
 * Wraps the app's `backgroundElement` so cards read consistently in light/dark. Plain stat
 * cards stay clean (the sky shows behind them); only the Progress moon hero opts in via
 * `pattern` for the seed-of-life that blends with the moon.
 */
export function StatCard({ style, pattern = false, ...rest }: ViewProps & { pattern?: boolean }) {
  // A stat card's `style` is content rhythm, so it rides the inner content layer — the outer card
  // keeps the elevation shadow. One shared header→content gap so every Progress stat card reads
  // with the same rhythm (callers used to each re-declare it); an override can still be passed.
  return <Surface padded pattern={pattern} contentStyle={[styles.card, style]} {...rest} />;
}

/**
 * The shared header for a stat card: a sentence-case title on the left and an optional
 * muted caption on the right, baseline-aligned. One definition so every stat card on the
 * Progress screen carries the same title weight, size, and rhythm.
 *
 * `accessory` is the far-right slot for a control that acts on the whole card — today only the
 * hero's ⓘ. It rides WITH the caption rather than beside it: a glyph has no text baseline to share,
 * so left to align itself against the row it centred on the row's full height — and the moment a
 * long title wrapped to two lines (it does at 1.5× type) the ⓘ sank to the middle of the block,
 * adrift from the caption it belongs to. Pairing them in one centred sub-row fixes both ends: the
 * glyph is centred on the caption's own line, and the pair sits on the title's FIRST baseline
 * however many lines the title turns out to need.
 */
export function StatCardHeader({
  title,
  trailing,
  accessory,
}: {
  title: string;
  trailing?: string;
  accessory?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <ThemedText type="heading" style={styles.title}>
        {title}
      </ThemedText>
      {trailing || accessory ? (
        <View style={styles.meta}>
          {trailing ? (
            <ThemedText type="small" themeColor="textSecondary">
              {trailing}
            </ThemedText>
          ) : null}
          {accessory}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // One card gap across all Progress stat cards, so their header→content rhythm reads identically.
  card: { gap: Spacing.three },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // The title and the caption still share a baseline; `meta` reports its first child's, so the
    // caption is what actually lands on it and the glyph rides along.
    alignItems: 'baseline',
    gap: Spacing.two,
    width: '100%',
  },
  title: { flex: 1 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
