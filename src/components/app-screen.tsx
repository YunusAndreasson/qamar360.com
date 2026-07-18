import { ScrollView, StyleSheet, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';

import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

type Props = Omit<ScrollViewProps, 'contentContainerStyle'> & {
  children?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  centered?: boolean;
  bottomInset?: boolean;
  /**
   * Render over a *fixed* backdrop supplied by the parent stack rather than painting an
   * opaque background: makes the scroll view see-through and (by default) drops the in-scroll
   * backdrop, so the parent's fixed sky shows through and stays put as content scrolls. The
   * scroll view is still the screen's first descendant, so the large title keeps collapsing.
   */
  transparent?: boolean;
};

export function AppScreen({
  children,
  contentStyle,
  centered,
  bottomInset = true,
  transparent = false,
  style,
  ...props
}: Props) {
  const theme = useTheme();
  // A fixed transparent screen leans on the parent stack's sky; the opaque default paints its
  // own faint flower-of-life backdrop behind the content.
  const backdrop = !transparent;

  // The ScrollView is returned as the screen's direct child — never wrapped in another
  // container at the route root. iOS large-title auto-inset and collapse-on-scroll only
  // engage for a top-level scrollable (it must be the screen view-controller's first
  // subview); a wrapping View (or a sibling rendered before it, like the backdrop) breaks
  // it. So in the default (opaque) mode the backdrop lives *inside* the ScrollView, behind
  // the (padded, max-width) content but full-bleed across the un-padded scroll container.
  // In `transparent` mode the parent stack paints a fixed sky behind the screen, and this
  // ScrollView is see-through over it.
  return (
    <ScrollView
      style={[styles.container, transparent ? styles.transparent : { backgroundColor: theme.background }, style]}
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  transparent: { backgroundColor: 'transparent' },
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
