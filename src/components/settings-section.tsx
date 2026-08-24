import { StyleSheet, View } from 'react-native';

import { SectionLabel } from '@/components/section-label';
import { SeparatedRows } from '@/components/separated-rows';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import type { ReactNode } from 'react';

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
 * stray dividers. Shares the card surface with {@link StatCard}, and the row/rule rule with every
 * other grouped card in the app ({@link SeparatedRows}).
 *
 * Unlike {@link CardSection} — the day's version of the same idea — this one has no horizontal
 * inset of its own: it lives inside `AppScreen`'s padded content, which has already supplied one.
 * Its `footer` is a caption BELOW the card, not a row inside it.
 */
export function SettingsSection({ title, footer, children }: Props) {
  return (
    <View style={styles.wrap}>
      {title ? <SectionLabel>{title.toUpperCase()}</SectionLabel> : null}
      <Surface>
        <SeparatedRows>{children}</SeparatedRows>
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
