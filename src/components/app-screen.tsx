import { ActivityIndicator, ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';

import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

type Props = Omit<ScrollViewProps, 'contentContainerStyle'> & {
  children?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  centered?: boolean;
  loading?: boolean;
  bottomInset?: boolean;
  /** Faint flower-of-life sky anchored to the top of the screen, behind the content. */
  backdrop?: boolean;
};

export function AppScreen({
  children,
  contentStyle,
  centered,
  loading,
  bottomInset = true,
  backdrop = true,
  style,
  ...props
}: Props) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.textSecondary} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {backdrop ? <GeometricBackdrop variant="screen" /> : null}
      <ScrollView
        style={[styles.container, style]}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          bottomInset && styles.bottomInset,
          centered && styles.centered,
          contentStyle,
        ]}
        {...props}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  bottomInset: {
    paddingBottom: BottomTabInset + Spacing.four,
  },
  centered: {
    flexGrow: 1,
    justifyContent: 'center',
  },
});
