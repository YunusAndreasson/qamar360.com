import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { AppIcon } from '@/components/app-icon';
import { CompletionRing } from '@/components/completion-ring';
import { RowOptionsButton, TRAILING_BOX } from '@/components/row-trailing-button';
import { ThemedText } from '@/components/themed-text';
import { Disabled, RowLeadingSlot, Spacing } from '@/constants/theme';
import type { Habit } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { countGoalLabel, toggleHint } from '@/lib/count-goal';

/** The act mark's geometry — a smaller ring than the 24pt one the stack header wears above it,
 *  with a stroke scaled to match, so the two read as the same mark at two ranks. The header is the
 *  sum and these are its parts, and the size difference is the only thing that has to say so. */
const ACT_RING = { size: 18, stroke: 1.75 } as const;

type Props = {
  habit: Habit;
  /** 1-based place in today's sequence. Not drawn — the column it used to occupy now holds the
   *  act's own mark — but still announced, since a screen reader reads rows one at a time and
   *  gets the order from nowhere else. */
  ordinal: number;
  /** Done for the viewed day. */
  done: boolean;
  /** Excused for the viewed day — out of the sequence, but still shown so the stack reads whole. */
  skipped: boolean;
  /** A count goal's logged count for the viewed day, while it is partway to its target. */
  count?: number;
  /** Tick this act for the viewed day, or take it back. */
  onToggle: (habit: Habit) => void;
  /** Open this act's sheet (skip today / stats / edit / move). */
  onOptions: (habit: Habit) => void;
  /** The viewed day's completions are being (re)fetched after a day-step — see `CompletionRing`'s
   *  `settling` doc. Keeps an act already done on the landed day from replaying its sweep. */
  settling?: boolean;
  /** Screen-reader reorder within the stack — the non-visual equivalent of the drag. */
  onMove?: (habit: Habit, delta: -1 | 1) => void;
};

/**
 * One act inside a stack — **and you can tick it.**
 *
 * It could not, once. The stack was the only unit the app tracked, so an act was a line you *read*
 * and the header's seal was the single completion gesture; this row carried an ordinal where its
 * mark would go, and its tap opened a sheet. That is a coherent model and a wrong one to put in
 * front of a person, for the plainest of reasons: a list of things to do, indented under a heading,
 * is a checklist in every app anyone has ever used, and Jakob's law is that they will arrive
 * expecting this one to behave like all of those. Tapping the fourth line of five and being handed
 * a menu is the app disagreeing with a person about what they just did — and the seal made them
 * wait until the whole sequence was finished before anything on screen would move at all.
 *
 * So the row is now the checkbox, exactly as a stack card's header and a stackless habit's row
 * already are: tapping the main region marks the act done, tapping a done one takes it back. The
 * mark is the same {@link CompletionRing} the whole app commits with, drawn one rank smaller than
 * the header's (see {@link ACT_RING}). Ticking an act advances the header's own ring by its share —
 * five acts with two done rests it at two fifths — so the group's mark is the running total of the
 * marks beneath it, and the last tick seals the stack on its own. The seal has not gone anywhere:
 * the header still finishes the whole sequence in one tap, which is what you want on a morning you
 * simply did the lot. Norman's two demands, both met by the same change — a control where the hand
 * expects one, and the system's state visible while it is still in progress rather than only at the
 * end.
 *
 * **The ordinal made way for the mark.** The leading slot is one column wide and it now belongs to
 * the ring; a numeral beside it would either crowd the mark or push every act's name out of the
 * meridian the card's title and the day's other rows hold. The sequence is still there to be read —
 * it is the order of the lines — and a screen reader is still told the number, since it takes the
 * rows one at a time and would otherwise have nothing to go on.
 *
 * **And the `⋯` is now a real button.** The row's tap is spoken for, so everything you can *do* to
 * a single act — excuse it today, its stats, edit it, move it — moved into the trailing door
 * that says exactly that everywhere else in the app (see `row-trailing-button.tsx`: a chevron means
 * more to READ, a `⋯` means things to DO). It was a bare glyph while the whole row opened that
 * sheet. A long press still belongs to the drag layer's wrapper (`DraggableMemberRow`).
 *
 * An excused act does not tick — there is nothing to assert about a day it doesn't apply to — so
 * its main region goes inert and wears the skip glyph in place of a ring, the same way an all-
 * excused stack header does. Its `⋯` stays live: un-excusing is the one thing an inert row still
 * has to be able to undo.
 */
function ActRowBase({ habit, ordinal, done, skipped, count = 0, onToggle, onOptions, settling = false, onMove }: Props) {
  const theme = useTheme();
  const target = habit.target_count;
  const color = done ? theme.textDisabled : skipped ? theme.textSecondary : theme.text;
  const goal = target != null ? countGoalLabel(target, habit.target_unit, count, done) : null;
  // A count partway to its target rests its ring part-drawn, as a stack header's does over its acts.
  const fraction = target != null && target > 0 && !done ? count / target : undefined;

  return (
    // The commit region runs the row's full width and the `⋯` floats over its reserved right edge —
    // the construction the stack header and the loose rows already use, and for the same reason:
    // laid out side by side, the press highlight stops short of the card's edge and the row looks
    // half-lit under the finger.
    <View style={styles.bar}>
      {/* Gesture-handler's `Touchable` rather than RN's `Pressable`: the press feedback (ripple on
          Android, underlay on iOS) is driven platform-side, so a tap costs no re-render — this is the
          densest list in the app and every act row re-rendering on press was pure waste. It also
          yields to continuous gestures, which is what keeps the parent `DraggableMemberRow`'s
          long-press pan winning over the tap. No haptic here either: the beat is fired from the seam
          in use-habits, so what you feel and what gets written can never disagree. */}
      <Touchable
        onPress={() => onToggle(habit)}
        disabled={skipped}
        androidRipple={skipped ? undefined : { color: theme.backgroundSelected }}
        // The iOS equivalent of the old `pressed && backgroundColor` style function — full-opacity
        // so it reads as the same solid highlight (the default 0.105 would barely register).
        underlayColor={skipped ? undefined : theme.backgroundSelected}
        activeUnderlayOpacity={1}
        accessibilityRole="checkbox"
        accessibilityLabel={
          // An excused act has no place in today's sequence, so it is read without an ordinal —
          // the same thing the skip glyph says in place of the mark. Done-ness is NOT spelled out:
          // it rides on `checked` below, and saying it twice is how a checkbox gets announced twice.
          (skipped ? habit.name : `${ordinal}. ${habit.name}`) +
          (goal ? `, ${goal}` : '') +
          (skipped ? ', skipped today' : '')
        }
        accessibilityHint={
          skipped
            ? 'Excused today. Open its options to bring it back.'
            : `${toggleHint(done, target != null)} Hold and drag to reorder the sequence.`
        }
        accessibilityState={{ checked: done, disabled: skipped }}
        accessibilityActions={
          onMove
            ? [
                { name: 'moveUp', label: 'Move up' },
                { name: 'moveDown', label: 'Move down' },
              ]
            : undefined
        }
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'moveUp') onMove?.(habit, -1);
          if (event.nativeEvent.actionName === 'moveDown') onMove?.(habit, 1);
        }}
        // See `CompletionRing`'s `settling` doc: while a day-step's blanked state is in flight, dim
        // the row rather than assert the confident-but-possibly-wrong "open" look. The real mark
        // and colour land the moment the fetch resolves.
        style={[styles.row, settling && styles.settling]}>
        {/* The same 32-wide leading slot the header's ring uses, so the acts' marks form a clean
            column under it and their names line up with the stack title. */}
        <View style={styles.leading}>
          {skipped ? (
            <AppIcon name="skip" size={20} color={theme.textSecondary} />
          ) : (
            <CompletionRing
              complete={done}
              fraction={fraction}
              size={ACT_RING.size}
              strokeWidth={ACT_RING.stroke}
              settling={settling}
            />
          )}
        </View>
        {/* Clamped like every other row on the day. An act's name is free text, and this was the
            one title in the list that could grow without limit — which matters more here than
            elsewhere, because the drag engine measures a card's height at lift (`ghostH`/`slotSize`)
            and the floating ghost has to be the same size as the hole it left. Two lines, matching
            the day's other free-text rows (a task, a stackless habit); one-line clamps are for rows
            whose text is a fixed label. */}
        <ThemedText type="rowTitle" numberOfLines={2} style={[styles.name, { color }]}>
          {habit.name}
        </ThemedText>
        {/* A count goal's target, read as part of the deed ("Drank water · 8 cups"), and how far
            through it the day is ("3 of 8 cups"): each tap counts one. flexShrink 0 — Android clips trailing
            flex-row text otherwise (the "Undo"→"Und" gotcha). */}
        {goal ? (
          <ThemedText type="small" themeColor="textDisabled" style={styles.target}>
            {`· ${goal}`}
          </ThemedText>
        ) : null}
      </Touchable>

      {/* Always enabled, even on an excused row: this is how you reach the sheet, and un-excusing is
          the one thing an inert row still needs to be able to undo. */}
      <RowOptionsButton
        label={`Manage ${habit.name}`}
        hint="Skip today, stats, edit, or move it to another stack."
        onPress={() => onOptions(habit)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'relative' },
  // Shorter than the 56pt the day's top-level rows keep: an act is a line inside a card, and the
  // tighter rhythm is what lets a five-act sequence be taken in as one shape. 44 is the floor a
  // tap target may not go under, which is exactly what this row became.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: Spacing.one,
    paddingLeft: Spacing.three,
    // The floated `⋯` button's box, reserved so a long name stops where the button begins — the
    // same constant the stack header and the loose rows reserve, so the day's trailing glyphs hold
    // one vertical line.
    paddingRight: TRAILING_BOX,
    gap: Spacing.three,
  },
  // See the row's `settling` comment: a plain dim, not an animation.
  settling: { opacity: Disabled },
  leading: RowLeadingSlot,
  name: { flex: 1 },
  target: { flexShrink: 0 },
});

// Memoized on what the line paints. A reorder re-stamps every habit's `position` (and a move its
// `stack_id`) into a fresh object — fields this row never renders — so the default identity
// compare would rebuild every act on the frame a drop commits. Keep in sync if the row starts
// rendering another `habit` field.
function actPropsEqual(a: Props, b: Props): boolean {
  return (
    a.habit.id === b.habit.id &&
    a.habit.name === b.habit.name &&
    a.habit.target_count === b.habit.target_count &&
    a.habit.target_unit === b.habit.target_unit &&
    a.ordinal === b.ordinal &&
    a.done === b.done &&
    a.count === b.count &&
    a.skipped === b.skipped &&
    a.settling === b.settling &&
    a.onToggle === b.onToggle &&
    a.onOptions === b.onOptions &&
    a.onMove === b.onMove
  );
}

export const ActRow = memo(ActRowBase, actPropsEqual);
