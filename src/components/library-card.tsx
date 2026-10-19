import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { PressableScale } from '@/components/pressable-scale';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Disabled, Face, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

/**
 * One entry in a ready-made library (stacks, exchanges): a name and the way to take it on one
 * line, then whatever the entry has to say, set quieter beneath.
 *
 * The add used to be a full-width button closing every card. Ten of them made ten equal bars, each
 * louder than the name above it, so the screen read as a column of buttons and the thing being
 * chosen came second. Now the name is the one strong line, and the add is the same tonal "+" pill
 * Discover's rows wear: a wash of accent that offers without shouting, and a bare check once taken.
 *
 * No emblem. It led the name with a moment glyph (stacks) or the same exchange glyph on every card,
 * and with the pill opposite it squeezed a name like "Waking up, for the body" onto two lines on a
 * phone. Today's stack cards dropped their emblems in August; the name says the moment already.
 */
export function LibraryCard({
  title,
  owned,
  action,
  children,
}: {
  title: string;
  /** Already kept: the pill becomes a quiet "Added". */
  owned: boolean;
  /** The pill's handler and accessibility, used only when not `owned`. `busy` while an add is
   *  being written: the pill dims and stops answering, so a second tap can't add it twice. */
  action: { onPress: () => void; accessibilityLabel: string; accessibilityHint: string; busy?: boolean };
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Surface padded contentStyle={styles.body}>
      <View style={styles.header}>
        {/* Owned recedes, as an added row does in Discover: the eye runs down the page to what is
            still on offer, not to what is already on Today. */}
        <ThemedText type="rowTitle" themeColor={owned ? 'textSecondary' : 'text'} style={styles.title}>
          {title}
        </ThemedText>
        {owned ? (
          <View style={styles.owned} accessible accessibilityLabel={`${title}, added`}>
            <AppIcon name="check" size={16} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              Added
            </ThemedText>
          </View>
        ) : (
          <PressableScale
            onPress={action.onPress}
            disabled={action.busy}
            accessibilityRole="button"
            accessibilityState={{ busy: !!action.busy, disabled: !!action.busy }}
            accessibilityLabel={action.accessibilityLabel}
            accessibilityHint={action.accessibilityHint}
            android_ripple={{ color: theme.backgroundSelected, borderless: false }}
            // The pill draws at 32pt; the slop takes the target to 44.
            hitSlop={6}
            style={[styles.add, { backgroundColor: theme.accentSubtle }, action.busy && { opacity: Disabled }]}>
            <AppIcon name="add" size={16} color={theme.accent} />
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Add
            </ThemedText>
          </PressableScale>
        )}
      </View>
      {children}
    </Surface>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  // Top-aligned, so a name that does wrap keeps the pill on its first line rather than centring
  // it between two.
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  // Semibold via the FACE, never fontWeight (the Android fake-bold gotcha). The 4pt top centres
  // the 24pt line on the 32pt pill.
  title: { flex: 1, paddingTop: Spacing.one, fontFamily: Face.bodySemiBold },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 32,
    paddingLeft: Spacing.two + Spacing.half,
    paddingRight: Spacing.three,
    borderRadius: Radius.full,
    overflow: 'hidden',
    // A trailing label never shrinks under a long title (the Android trailing-text clip).
    flexShrink: 0,
  },
  owned: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, minHeight: 32, flexShrink: 0 },
});
