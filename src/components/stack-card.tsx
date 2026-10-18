import { memo, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { ActRow } from '@/components/act-row';
import { AppIcon } from '@/components/app-icon';
import { CompletionRing } from '@/components/completion-ring';
import { Fold } from '@/components/fold';
import { DraggableMemberRow } from '@/components/habit-drag';
import { ManageRow } from '@/components/manage-row';
import { TRAILING_BOX, TRAILING_GLYPH, trailingGlyphBox } from '@/components/row-trailing-button';
import { SeparatedRows } from '@/components/separated-rows';
import { StackCompleteFlash } from '@/components/stack-complete-flash';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Collapse } from '@/constants/motion';
import { Disabled, Face, RowLeadingSlot, Spacing, UnitRow, UnitRowText } from '@/constants/theme';
import type { Habit, HabitStack } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { isStackComplete } from '@/lib/progress';
import { stackHeaderContract } from '@/lib/stack-card-state';

type Props = {
  stack: HabitStack;
  /** The stack's acts scheduled for the viewed day, in sequence order. */
  members: Habit[];
  completed: Set<string>;
  /** Ids of acts skipped (excused) for the viewed day. */
  skipped: Set<string>;
  /** The viewed day's logged count per count-goal act, for the ones partway to their target. */
  counts: ReadonlyMap<string, number>;
  /** The viewed day's completions are being (re)fetched after a day-step — `completed`/`skipped`
   *  are the blanked pre-fetch state, not yet the day's truth. Suppresses the seal flash and
   *  auto-fold for the transition where a stack merely catches up to a day already sealed. */
  settling?: boolean;
  /** Tick one act for the viewed day, or take it back — fired by a tap on an act row. */
  onToggleAct: (habit: Habit) => void;
  /** Open one act's sheet (skip today / stats / edit / move) — the act row's `⋯`. */
  onAct: (habit: Habit) => void;
  /** Open the stack's sheet (add acts / stats / edit / delete) — the sibling of {@link onAct}. */
  onEditStack: (stackId: string) => void;
  /** Screen-reader reorder for the whole stack (Move up / Move down on the header). */
  onMove?: (stackId: string, delta: -1 | 1) => void;
  /** Screen-reader reorder for an act within the stack (forwarded to each row). */
  onMoveHabit?: (habit: Habit, delta: -1 | 1) => void;
  /** Open the stack-scoped Add screen — the empty card's whole reason to exist. */
  onAddHabits?: (stackId: string) => void;
  /**
   * Whether the body is unfolded. Owned by the screen, never local: the drag layer renders a
   * SECOND StackCard as the floating ghost, and `ghostH`/`slotSize` are measured from the
   * ORIGINAL at lift — so a ghost that folded differently would be a different size from the
   * hole it left, and the whole reorder would resolve against the wrong slot.
   */
  expanded: boolean;
  /** Set this stack's fold: the header's tap, and the auto-fold once the last act is ticked.
   *  Idempotent on the screen side, so the auto-fold can fire it at an already-folded card. */
  onSetExpanded: (stackId: string, expanded: boolean) => void;
};

/**
 * A stack rendered as the thing the app tracks: an anchored, ordered sequence you tick your way
 * through.
 *
 * **The acts are the only commit.** Each act inside the card ticks on its own (see {@link ActRow}),
 * and the last tick keeps the stack. Underneath, each tick writes an ordinary done row (which is why
 * Progress and Stats need to know nothing about stacks).
 *
 * **The header is a gauge and a door.** Its {@link CompletionRing} fills to the share of the acts
 * that are done, and the sub-line says the same in figures ("5 of 10 acts done"): a proportion
 * answers *roughly how far* at a glance and a number answers *exactly where*. A tap anywhere on the
 * bar opens or closes the sequence. The bar used to seal the whole stack instead, and a tap on a
 * sealed bar deleted every act's record for the day, including acts ticked one by one, with no
 * undo. Two controls for one job, and the bigger one destroyed data, so the seal went.
 *
 * **Every stack is born folded.** Folded, the card is a single bar carrying its mark, its name, how
 * far through it you are. Everything that *manages* the stack (the "⋯") lives inside the fold.
 *
 * In the Today grid the card takes part in the drag vocabulary: hold anywhere on it to lift and
 * reorder the whole stack, hold an act to move it within the sequence or into another stack.
 * When the last act is ticked the border flashes
 * ({@link StackCompleteFlash}) with a synced haptic, and the card folds itself away a beat later:
 * a finished stack recedes so the day's remaining work rises.
 */
function StackCardBase({
  stack,
  members,
  completed,
  skipped,
  counts,
  settling = false,
  onToggleAct,
  onAct,
  onEditStack,
  onMove,
  onMoveHabit,
  onAddHabits,
  expanded,
  onSetExpanded,
}: Props) {
  const theme = useTheme();
  // The acts actually in play today: the excused drop out of the sequence the stack asks for
  // (the same rule `sealableActs` applies to the write, so the card and the row can't disagree).
  const openActs = members.filter((m) => !skipped.has(m.id));
  // How much of the sequence stands done — the header ring's fill and the sub-line's count, which
  // are the same fact told twice (a proportion you can see at a glance, a number you can read).
  // Derived here rather than in a helper of its own: `isStackComplete` owns the *rule* for sealed
  // and this is only the count behind it, over the very `openActs` that rule resolves.
  const doneCount = openActs.reduce((n, m) => n + (completed.has(m.id) ? 1 : 0), 0);
  const doneFraction = openActs.length === 0 ? 0 : doneCount / openActs.length;
  // The whole group sealed. Drives the one-shot border flash, the greyed header tone, the status
  // check and the auto-fold; the synced completion haptic is fired from the seal seam in use-habits.
  const stackComplete = isStackComplete(members, completed, skipped);
  // Any non-empty stack folds. The empty "Add your first act" card has nothing to hide.
  const collapsible = members.length > 0;
  // Every act excused today: the ring has nothing to fill, so the skip glyph stands in its slot.
  const allExcused = collapsible && openActs.length === 0;

  const header = stackHeaderContract({
    name: stack.name,
    memberCount: members.length,
    openCount: openActs.length,
    doneCount,
    expanded,
  });
  // The sub-line, with the settling window's own answer in front of it — see `CompletionRing`'s
  // `settling` doc: during a day-step the card's inputs are blanked, so the contract's count is
  // briefly a confident number for the wrong day.
  const summary = settling ? 'Loading' : header.summary;

  // Fold shut on the SEAL edge only, and only into a rested flash: a genuine seal holds a beat
  // (Collapse.lead) so StackCompleteFlash plays out, THEN the card folds — the recede is part of
  // the seal rather than a race with it. UN-sealing changes the fold not at all: every stack is
  // born folded, so re-opening the day's work must not also re-open the card under the finger.
  // Sealing an already-folded card still schedules this; `onSetExpanded` is idempotent, so it
  // lands as a no-op. Seal-then-unseal inside the lead is handled for free — the effect re-runs
  // and React clears the pending timer first.
  const wasComplete = useRef(stackComplete);
  // See `CompletionRing`'s `settling` doc: read the PRIOR render's value, since the fetch that
  // ends the settling window can land `stackComplete`'s catch-up in that very same render.
  const wasSettling = useRef(settling);
  useEffect(() => {
    const wasSettlingBefore = wasSettling.current;
    wasSettling.current = settling;
    if (wasComplete.current === stackComplete) return;
    wasComplete.current = stackComplete;
    if (!stackComplete || settling || wasSettlingBefore) return;
    const timer = setTimeout(() => onSetExpanded(stack.id, false), Collapse.lead);
    return () => clearTimeout(timer);
  }, [stackComplete, settling, stack.id, onSetExpanded]);

  // The header opens the sequence, or on a stack with no acts yet leads where its body row leads.
  // No haptic: disclosure never buzzes (`haptics.ts`).
  const onHeaderPress =
    header.mode === 'add' ? () => onAddHabits?.(stack.id) : () => onSetExpanded(stack.id, !expanded);


  // The stack's own door, written once. Both branches below close on it — the populated card puts
  // it behind the fold, the empty one has no fold to put it behind — and while it was spelled out
  // twice, a change to its wording or its hint had two places to land and only ever reached one.
  const manageStack = (
    <ManageRow
      label="Manage stack"
      accessibilityLabel={`Manage ${stack.name} stack`}
      accessibilityHint="Add acts, see stats, edit, or delete the stack."
      onPress={() => onEditStack(stack.id)}
    />
  );

  return (
    <View>
      <Surface>
        <View>
          {/* Gesture-handler's `Touchable` rather than PressableScale: this row lives inside the drag
              layer's pan, where the house rule (pressable-scale's own doc) is a background
              highlight, because a scale transform fights the gesture translate. It also costs no
              re-render and yields to continuous gestures, so the card's 350ms lift still wins from
              the header. One target for the whole bar: the chevron at its edge is the signifier,
              not a second control. */}
          <Touchable
            onPress={onHeaderPress}
            androidRipple={{ color: theme.backgroundSelected }}
            underlayColor={theme.backgroundSelected}
            activeUnderlayOpacity={1}
            accessibilityRole="button"
            // `header.label` already carries the act count the sub-line shows, so the two are not
            // read one after the other; only the settling window adds anything it doesn't say.
            accessibilityLabel={settling ? `${header.label}, loading` : header.label}
            accessibilityHint={header.hint}
            accessibilityState={collapsible ? { expanded } : undefined}
            accessibilityActions={
              onMove
                ? [
                    { name: 'moveUp', label: 'Move up' },
                    { name: 'moveDown', label: 'Move down' },
                  ]
                : undefined
            }
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'moveUp') onMove?.(stack.id, -1);
              if (event.nativeEvent.actionName === 'moveDown') onMove?.(stack.id, 1);
            }}
            // Settling's blanked `completed`/`skipped` render as a confident "open" mark and
            // full-bright title, a real-looking answer that just happens to be wrong for a beat.
            // Dim the whole header instead of asserting either state while the day's real truth is
            // still in flight.
            style={[styles.header, settling && styles.settling]}>
            {/* The gauge, in the same 32-wide slot the act rows give their rings, so it sits directly
                above them and the title lines up with the act names. An all-excused stack has
                nothing to fill, so it shows the skip glyph in place of a ring. */}
            <View style={styles.leading}>
              {allExcused ? (
                <AppIcon name="skip" size={20} color={theme.textSecondary} />
              ) : (
                <CompletionRing
                  complete={stackComplete}
                  // The group's mark is the running total of the marks below it: two acts of five
                  // ticked rests this arc at two fifths, and the fifth tick closes it.
                  fraction={doneFraction}
                  size={24}
                  strokeWidth={2}
                  settling={settling}
                />
              )}
            </View>
            <View style={styles.titleBlock}>
              <ThemedText type="rowTitle" style={[styles.title, stackComplete && { color: theme.textSecondary }]}>
                {stack.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {summary}
              </ThemedText>
            </View>
          </Touchable>
          {collapsible ? (
            <View style={styles.chevron} pointerEvents="none">
              <AppIcon
                name={expanded ? 'expandLess' : 'expandMore'}
                size={TRAILING_GLYPH}
                color={theme.textSecondary}
              />
            </View>
          ) : null}
        </View>

        {collapsible ? (
          <Fold expanded={expanded} contentStyle={styles.bodyContent}>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            {/* Inset row rules between the acts, and one more above the manage door — the same
                grouped-list rule the settings cards and the day's sections keep. */}
            <SeparatedRows trailing={manageStack}>
              {members.map((habit, index) => (
                // Hold and drag an act to move it within the sequence, or into another stack.
                <DraggableMemberRow
                  key={habit.id}
                  habitId={habit.id}
                  parentStackId={stack.id}
                  memberIndex={index}>
                  <ActRow
                    habit={habit}
                    // Numbered over the acts actually in play, so an excused act doesn't
                    // leave a hole in the sequence a screen reader is given.
                    ordinal={openActs.findIndex((m) => m.id === habit.id) + 1}
                    done={completed.has(habit.id)}
                    skipped={skipped.has(habit.id)}
                    count={counts.get(habit.id)}
                    settling={settling}
                    onToggle={onToggleAct}
                    onOptions={onAct}
                    onMove={onMoveHabit}
                  />
                </DraggableMemberRow>
              ))}
            </SeparatedRows>
          </Fold>
        ) : (
          // A brand-new stack waiting on its first act: the next step lives inside the card
          // itself. Deliberately NOT the animated clip — nothing here folds, and an animated
          // height driven from an unmeasured `contentH` would paint one frame at 0 and pop.
          <View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            {/* An empty card has no fold to hide the manage door behind, and it is the one card
                most likely to need deleting — a stack built by accident. */}
            <SeparatedRows trailing={manageStack}>
              <Touchable
                onPress={() => onAddHabits?.(stack.id)}
                androidRipple={{ color: theme.backgroundSelected }}
                underlayColor={theme.backgroundSelected}
                activeUnderlayOpacity={1}
                accessibilityRole="button"
                accessibilityLabel={`Add your first act to ${stack.name}`}
                style={styles.addFirst}>
                {/* Same 32-wide leading slot as the header glyph and the act numerals, so the +
                    sits directly under the stack icon and the label lines up with the title. */}
                <View style={styles.leading}>
                  <AppIcon name="add" size={26} color={theme.accent} />
                </View>
                <ThemedText type="rowTitle" themeColor="accent">
                  Add your first act
                </ThemedText>
              </Touchable>
            </SeparatedRows>
          </View>
        )}
      </Surface>
      {/* Sibling of the Surface (not a child — the Surface clips its content), so the 2px border
          overlays the whole card at its rounded rect and flashes when the stack seals. Around a
          folded bar this ring is the seal's main confirmation, and proportionally far louder than
          it ever was around a full card. */}
      <StackCompleteFlash complete={stackComplete} settling={settling} />
    </View>
  );
}

const styles = StyleSheet.create({
  // A bare `Surface` card (radius/border/bg come from Surface) — no margins: the drag grid
  // measures the bare item, so spacing comes from the grid's `gap` + its padding.
  // The header. 56 rather than the old 44 is set by the drag engine: a card's "drop an act
  // into me" band is its frame inset top and bottom by 20% of its height, clamped to 12 — so a
  // 44pt bar joins on 20pt, while 56 gives 32pt, exactly what a full expanded card gets at the
  // clamp ceiling. It also lands the list on one repeat unit (56 + the grid's 8pt gap = 64) and
  // stops Radius.card from eating a third of the height per corner.
  header: {
    ...UnitRow,
    // The chevron's box, reserved so the title stops where it begins. Kept
    // as one derived constant rather than a literal, so widening the button can't silently start
    // clipping names — and shared with the rows below, which reserve the same box for their `⋯`.
    paddingRight: TRAILING_BOX,
  },
  // The fold's signifier, on the same vertical line as every row's trailing `⋯` below it. Inert:
  // the header beneath it takes the tap, so the press highlight runs the whole bar.
  chevron: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    ...trailingGlyphBox,
  },
  // See the header's `settling` comment: a plain dim, not an animation — the fetch it's waiting
  // on is what settles, this just holds off asserting an answer meanwhile.
  settling: { opacity: Disabled },
  // Leading mark slot — fixed width in every state: the card's height never changes with its
  // mark, so the drag grid's measured frames stay valid.
  leading: RowLeadingSlot,
  // Sized to the act rows (rowTitle, 17pt) so the stack's own name never reads smaller than the
  // acts it holds; the semibold weight + leading mark set it apart as the header.
  // Semibold via the FACE, never fontWeight: a weight override beside rowTitle's registered
  // family would silently fall back to Roboto on Android (the theme.ts fake-bold gotcha).
  // flex 1 — with three siblings competing for the row, the title is the one that gives way.
  // The shared text column (Spacing.three, not two), so the title lands in the same column as the
  // act names below.
  titleBlock: UnitRowText,
  title: { fontFamily: Face.bodySemiBold },
  // Radius.card curves through the last 14dp of the card, so a flush final row would put its
  // descenders and its trailing "· 8 cups" meta inside the corner arc, and its press highlight
  // would end on the card's own curve rather than reading as a row. Inside the measured node, so
  // `contentH` picks it up.
  bodyContent: { paddingBottom: Spacing.two },
  // Full-bleed rule under the stack header (a header separator, distinct from the row dividers).
  divider: { height: StyleSheet.hairlineWidth },
  // The empty card's single "Add your first act" row — sized like an act row plus breathing
  // room so the card doesn't collapse to a sliver while it waits, and sharing the 32-slot +
  // Spacing.three gap so its + and label align with the header glyph/title above.
  addFirst: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});

// Memoized on what the card paints. Like ActRow, a reorder re-stamps every act's `position` into a
// fresh object and `entries` hands over a fresh `members` array each render — so the default
// identity compare would rebuild the whole card (every act's drag subtree) on the frame a drop
// commits. Compare the rendered stack fields, the members by the fields their rows read, and the
// day-state by membership for this stack, plus callbacks by identity. The day-level Sets are
// replaced for every completion, but a card only paints the status of its own members; comparing
// the whole Set identities made one act rebuild every stack and all of their drag subtrees.
// KEEP IN SYNC: any newly *rendered* stack field or prop must be compared here, or the card will
// silently ignore its changes (`expanded` drives the fold, and without it the chevron would look
// dead).
function stackPropsEqual(a: Props, b: Props): boolean {
  if (
    a.stack.id !== b.stack.id ||
    a.stack.name !== b.stack.name ||
    a.expanded !== b.expanded ||
    a.onSetExpanded !== b.onSetExpanded ||
    // `settling` usually rides along with a fresh `completed` Set, but not always: a day-switch
    // whose completions fetch FAILS turns it off while leaving the blanked sets at their existing
    // identity. Skipping the re-render then strands this card's `wasSettling` guard (and its
    // children's) at `true`, and the next genuine seal plays no sweep, no border flash and no
    // auto-fold for the rest of the day.
    a.settling !== b.settling ||
    a.onToggleAct !== b.onToggleAct ||
    a.onAct !== b.onAct ||
    a.onEditStack !== b.onEditStack ||
    a.onMove !== b.onMove ||
    a.onMoveHabit !== b.onMoveHabit ||
    a.onAddHabits !== b.onAddHabits ||
    a.members.length !== b.members.length
  ) {
    return false;
  }
  return a.members.every((m, i) => {
    const n = b.members[i]!;
    return (
      m.id === n.id &&
      m.name === n.name &&
      m.target_count === n.target_count &&
      m.target_unit === n.target_unit &&
      a.completed.has(m.id) === b.completed.has(n.id) &&
      a.skipped.has(m.id) === b.skipped.has(n.id) &&
      a.counts.get(m.id) === b.counts.get(n.id)
    );
  });
}

export const StackCard = memo(StackCardBase, stackPropsEqual);
