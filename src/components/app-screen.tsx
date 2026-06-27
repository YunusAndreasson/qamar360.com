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

  // The ScrollView is returned as the screen's direct child — never wrapped in another
  // container at the route root. iOS large-title auto-inset and collapse-on-scroll only
  // engage for a top-level scrollable (it must be the screen view-controller's first
  // subview); a wrapping View (or a sibling rendered before it, like the backdrop) breaks
  // it. The backdrop therefore lives *inside* the ScrollView, behind the (padded,
  // max-width) content but full-bleed across the un-padded scroll container. Loading is
  // rendered inside too, so the root view is always the ScrollView.
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }, style]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.scrollContent}
      {...props}>
      {backdrop ? <GeometricBackdrop variant="screen" /> : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      ) : (
        <View
          style={[
            styles.content,
            bottomInset && styles.bottomInset,
            centered && styles.centered,
            contentStyle,
          ]}>
          {children}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
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
