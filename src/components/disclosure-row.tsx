import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { FadeInView } from '@/components/fade-in-view';
import { ThemedText } from '@/components/themed-text';
import { Pressed, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

/**
 * A quiet "show me the reasoning" row and the content it reveals: the evidence behind a curated
 * exchange, and the guide that opens at the head of each library.
 *
 * It stays deliberately plain — a text row and a chevron, not a chevron-and-divider affair.
 * Wherever this appears it is the least of the things on screen and must not out-dress the choice
 * above it. It owns its own open state; neither caller needs to read it.
 *
 * Returns a fragment rather than wrapping in a `View`: both callers are columns with their own
 * `gap`, and a wrapper would collapse the revealed content into the row's spacing.
 *
 * **RN `Pressable`, never gesture-handler's `Touchable`.** Inside a `Surface`, the `Touchable`
 * takes the press — its underlay lights and latches — and never fires `onPress` on release;
 * verified twice on device, with and without the `underlayColor` + `activeUnderlayOpacity` recipe
 * the day's full-width rows use. `Pressable` is what `SettingsRow` uses, and it works.
 */
export function DisclosureRow({
  label,
  accessibilityLabel,
  expandHint,
  collapseHint,
  children,
}: {
  label: string;
  /** Defaults to `label` — pass one when several of these share a screen and need telling apart. */
  accessibilityLabel?: string;
  expandHint: string;
  collapseHint: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        android_ripple={{ color: theme.backgroundSelected }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={expanded ? collapseHint : expandHint}
        style={({ pressed }) => [styles.row, pressed && { opacity: Pressed.dim }]}>
        {/* `textSecondary`, not the `textDisabled` this row used to wear on an exchange card: it
            is a tappable control, and `textDisabled` is the app's Lc-15 legibility floor. It still
            sits level with the plan line above it rather than above it. */}
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <AppIcon name={expanded ? 'expandLess' : 'expandMore'} size={16} color={theme.textSecondary} />
      </Pressable>
      {/* A shared-value mount fade, never reanimated `entering` — the SDK 57 Fabric preset bug
          (see FadeInView). Collapse stays an instant removal: exit animations need that same
          broken layout-animation machinery. */}
      {expanded ? <FadeInView>{children}</FadeInView> : null}
    </>
  );
}

const styles = StyleSheet.create({
  // A real 44pt target, with the glyph bound to its label rather than pushed to the far edge.
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, minHeight: 44 },
});
