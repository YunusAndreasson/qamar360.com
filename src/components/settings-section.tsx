import { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { SectionLabel } from '@/components/section-label';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
  const theme = useTheme();
  const rows = Children.toArray(children).filter(Boolean);

  return (
    <View style={styles.wrap}>
      {title ? <SectionLabel>{title.toUpperCase()}</SectionLabel> : null}
      <Surface>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? <View style={[styles.divider, { backgroundColor: theme.border }]} /> : null}
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
  // Inset hairline between rows (aligned past the horizontal padding), iOS-style.
  divider: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.three },
});
