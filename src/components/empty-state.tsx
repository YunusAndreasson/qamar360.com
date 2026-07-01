import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

type Props = {
  /** Optional calm glyph above the copy (semantic name from the icon registry). */
  icon?: IconName;
  /**
   * A branded emblem rendered above the copy in place of {@link icon} — e.g. `<MoonEmblem/>`.
   * Use it for the warm first-run / no-data moments; keep `icon` for contextual states (a
   * `search-off` no-result, a `cloud-off` load failure).
   */
  art?: ReactNode;
  title: string;
  body?: string;
  /** Action(s) — typically an `AppButton` — rendered below the copy. */
  children?: ReactNode;
};

/**
 * One centred empty-state treatment for the whole app: a branded emblem or a muted glyph, a
 * title, a supporting line, and optional actions. Keeps every "nothing here yet" surface (Today,
 * Discover, Progress) consistent in spacing, colour and weight instead of each screen
 * hand-rolling its own.
 */
export function EmptyState({ icon, art, title, body, children }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      {art ?? (icon ? <AppIcon name={icon} size={40} color={theme.textSecondary} /> : null)}
      <ThemedText type="defaultSemiBold" style={styles.text}>
        {title}
      </ThemedText>
      {body ? (
        <ThemedText type="small" themeColor="textSecondary" style={[styles.text, styles.body]}>
          {body}
        </ThemedText>
      ) : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  text: { textAlign: 'center' },
  body: { maxWidth: 320 },
  actions: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
});
