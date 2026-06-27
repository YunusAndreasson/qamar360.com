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

  // The ScrollView must be the screen's first subview: react-native-screens finds the
  // large-title scroll view by walking the `subviews[0]` chain
  // (RNSScrollViewFinder.findScrollViewInFirstDescendantChainFrom), so a sibling rendered
  // before it (e.g. the backdrop) would stop the search and the iOS large title would never
  // collapse on scroll. The backdrop therefore lives inside the ScrollView, behind the
  // (padded, max-width) content but full-bleed across the un-padded scroll container.
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        style={[styles.container, style]}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
        {...props}>
        {backdrop ? <GeometricBackdrop variant="screen" /> : null}
        <View
          style={[
            styles.content,
            bottomInset && styles.bottomInset,
            centered && styles.centered,
            contentStyle,
          ]}>
          {children}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // flexGrow so the inner content can fill the viewport when `centered`, and so short
  // screens still scroll-track the large title.
  scrollContent: { flexGrow: 1 },
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
