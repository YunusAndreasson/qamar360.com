import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Face, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

/**
 * One entry in a ready-made library (stacks, exchanges): an emblem and a name, whatever the entry
 * has to say, then either the way to take it or the quiet note that it's already kept. The two
 * libraries used to write this frame out each on their own, down to the same five styles; the
 * body between header and footer is the only part that differs, so it is the children.
 */
export function LibraryCard({
  icon,
  title,
  owned,
  action,
  children,
}: {
  icon: IconName;
  title: string;
  /** Already kept: the footer becomes "Already yours" instead of the button. */
  owned: boolean;
  /** The button's label and accessibility, used only when not `owned`. */
  action: { label: string; onPress: () => void; accessibilityLabel: string; accessibilityHint: string };
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Surface padded contentStyle={styles.body}>
      <View style={styles.header}>
        <AppIcon name={icon} size={22} color={theme.textSecondary} />
        <ThemedText type="rowTitle" style={styles.title}>
          {title}
        </ThemedText>
      </View>
      {children}
      {owned ? (
        <View style={styles.owned}>
          <AppIcon name="check" size={16} color={theme.textDisabled} />
          <ThemedText type="small" themeColor="textDisabled">
            Already yours
          </ThemedText>
        </View>
      ) : (
        <AppButton
          variant="secondary"
          onPress={action.onPress}
          accessibilityLabel={action.accessibilityLabel}
          accessibilityHint={action.accessibilityHint}>
          {action.label}
        </AppButton>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // Semibold via the FACE, never fontWeight (the Android fake-bold gotcha).
  title: { flex: 1, fontFamily: Face.bodySemiBold },
  owned: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
});
