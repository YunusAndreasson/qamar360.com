import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { FieldLabel } from '@/components/field-label';
import { RowSeparator } from '@/components/row-separator';
import { ThemedText } from '@/components/themed-text';
import { RowLeadingSlot, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Plan } from '@/lib/plans';
import { separatedRows } from '@/lib/separated-rows';

/**
 * Your plans, offered inside the open to-do field.
 *
 * The plans list is a place you go; this is the shortcut for the moment you are already writing a
 * to-do and the thing you want is something you wrote down weeks ago. Tapping a row puts that plan
 * on the day as a to-do, which is why each one wears the composer's own accent "＋" rather than a
 * chevron: a chevron in this app means there is more of this to read, and there is nothing to read
 * here — the tap writes. The field stays open afterwards, as it does after Return, and the plan
 * drops out of the strip on its own rather than sitting there offering a duplicate.
 *
 * It appears only while the field is still untouched, and never during a rename. Once you have
 * typed a character you are writing your own to-do, and a list of suggestions shifting under the
 * keyboard while you do that is worse than no shortcut at all. It does not come back when Return
 * clears the field for the next one, either — the field is open, and the shortcut has had its turn.
 *
 * The rule between rows comes from {@link separatedRows}, the same resolved-as-data rule every
 * grouped card uses. It is drawn here rather than by `SeparatedRows` because a card's `trailing`
 * is handed through as one opaque node — the composer and this strip arrive as a single row from
 * that component's point of view, so the divisions inside them are this component's to draw.
 */
/** How long after a pick a second touch is read as the same one. A double-tap is well inside it. */
const PICK_WINDOW_MS = 400;

export function PlanPicks({ plans, onPick }: { plans: Plan[]; onPick: (plan: Plan) => void }) {
  const theme = useTheme();
  // A press fires on touch-down (see below), so a slow or shaky finger can deliver two before the
  // strip has settled — and the picked plan leaves the strip, so the rows under the finger shift
  // up by one. A second touch at the same point would land on a plan nobody chose.
  //
  // The guard is on the clock, not on the offered set. Latching a flag and re-arming it when
  // `plans` changes cannot work here: a pick is *what changes* `plans`, so the latch re-arms
  // inside the very burst it exists to swallow. A window is short enough that two deliberate
  // picks in a row still both land.
  const pickedAt = useRef(0);

  const rows = separatedRows(
    plans.map((plan) => (
      <Pressable
        key={plan.id}
        // `onPressIn`, deliberately, and for the reason the composer's own delete button uses it:
        // this row sits beside a focused field whose blur closes the composer, and a press that
        // waited for the release has been observed being cancelled out from under the finger.
        onPressIn={() => {
          const now = Date.now();
          if (now - pickedAt.current < PICK_WINDOW_MS) return;
          pickedAt.current = now;
          onPick(plan);
        }}
        android_ripple={{ color: theme.backgroundSelected }}
        accessibilityRole="button"
        accessibilityLabel={plan.title}
        accessibilityHint="Puts it on today’s list."
        style={styles.row}>
        <View style={styles.leading}>
          <AppIcon name="add" size={20} color={theme.accent} />
        </View>
        <ThemedText type="rowTitle" numberOfLines={1} style={styles.title}>
          {plan.title}
        </ThemedText>
      </Pressable>
    )),
  );

  return (
    <>
      <RowSeparator />
      {/* The one line that says where these came from. Without it a plan under the field is just a
          to-do someone else wrote, and the two lists never connect in the reader's head. */}
      <View style={styles.caption}>
        <FieldLabel>From your plans</FieldLabel>
      </View>
      {rows.map((row) => (
        <View key={row.key}>
          {row.separated ? <RowSeparator /> : null}
          {row.node}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  // The row geometry of a to-do, so the strip lines up with the list it writes into.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    minHeight: 56,
  },
  leading: RowLeadingSlot,
  title: { flex: 1, marginLeft: Spacing.three },
  // Not a row: no 56pt minimum and no leading slot, so it reads as a heading over the rows rather
  // than as the first of them. The app's own form caption, at the caption size every other one
  // keeps — it was the one text in the app set off the type ramp (12pt). FieldLabel brings its own
  // 8pt top margin, so the padding here makes up the same 16 above it.
  caption: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.one },
});
