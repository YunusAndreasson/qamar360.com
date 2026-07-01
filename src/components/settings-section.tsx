import { Children, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { RowSeparator } from '@/components/row-separator';
import { SectionLabel } from '@/components/section-label';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type Props = {
  /** Uppercase group label shown above the card. */
  title?: string;
  /** Muted caption shown under the card (e.g. an explanation). */
  footer?: string;
  children: ReactNode;
};

/**
 * A labelled, rounded group of {@link SettingsRow}s — the inset-grouped-list idiom used by
 * Notion/Linear/iOS Settings. Falsy children are dropped so conditional rows don't leave
 * stray dividers. Shares the card surface with {@link StatCard}.
 */
export function SettingsSection({ title, footer, children }: Props) {
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View style={styles.wrap}>
      {title ? <SectionLabel>{title.toUpperCase()}</SectionLabel> : null}
      <Surface>
        {rows.map((row, i) => (
          // Key by the child's own identity, not the array index, so a row keeps its React
          // instance — and any internal state, e.g. a Discover row's expanded detail — when the
          // list is filtered or reordered around it, instead of being recycled into a sibling.
          <View key={(isValidElement(row) && row.key) || i}>
            {i > 0 ? <RowSeparator /> : null}
            {row}
          </View>
        ))}
      </Surface>
      {footer ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
          {footer}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.two },
  footer: { marginLeft: Spacing.three, marginRight: Spacing.three },
});
