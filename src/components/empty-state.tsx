import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

type Props = {
  /** Optional calm glyph above the copy. */
  icon?: keyof typeof MaterialIcons.glyphMap;
  title: string;
  body?: string;
  /** Action(s) — typically an `AppButton` — rendered below the copy. */
  children?: ReactNode;
};

/**
 * One centred empty-state treatment for the whole app: an optional muted glyph, a title,
 * a supporting line, and optional actions. Keeps every "nothing here yet" surface (Today,
 * Discover, Progress) consistent in spacing, colour and weight instead of each screen
 * hand-rolling its own.
 */
export function EmptyState({ icon, title, body, children }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      {icon ? <MaterialIcons name={icon} size={36} color={theme.textSecondary} /> : null}
      <ThemedText type="default" themeColor="textSecondary" style={styles.text}>
        {title}
      </ThemedText>
      {body ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
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
  actions: { alignSelf: 'stretch', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.three },
});
