import { memo, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';

import { ActRow } from '@/components/act-row';
import { AppIcon } from '@/components/app-icon';
import { CompletionRing } from '@/components/completion-ring';
import { Fold, FoldToggle } from '@/components/fold';
import { DraggableMemberRow } from '@/components/habit-drag';
import { ManageRow } from '@/components/manage-row';
import { TRAILING_BOX } from '@/components/row-trailing-button';
import { SeparatedRows } from '@/components/separated-rows';
import { StackCompleteFlash } from '@/components/stack-complete-flash';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Collapse } from '@/constants/motion';
import { Disabled, Face, RowLeadingSlot, Spacing } from '@/constants/theme';
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
  /** The viewed day's completions are being (re)fetched after a day-step — `completed`/`skipped`
   *  are the blanked pre-fetch state, not yet the day's truth. Suppresses the seal flash and
   *  auto-fold for the transition where a stack merely catches up to a day already sealed. */
  settling?: boolean;
  /** Mark the whole stack done for the viewed day — fired by a tap on the header. */
  onSeal: (stackId: string) => void;
  /** Re-open a sealed stack — fired by a tap on the header of a sealed one. */
  onUnseal: (stackId: string) => void;
  /** Open one act's sheet (skip today / insights / edit / move). */
  onAct: (habit: Habit) => void;
  /** Open the stack's sheet (add acts / insights / edit / delete) — the sibling of {@link onAct}. */
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
  /** Set this stack's fold. Idempotent on the screen side, so the seal's auto-fold can fire it
   *  at an already-folded card without a guard here. */
  onSetExpanded: (stackId: string, expanded: boolean) => void;
  /** This stack's moment is current (its band matches the real sun's, or its Friday matches
   *  today) — the header carries its closing clock while it is. Computed once in the screen from
   *  `useSunCycle`; never read from a context here (that would bypass the memo below). */
  isCurrentChapter?: boolean;
  /** Preformatted local closing time of the current band ("9:47 PM"), rendered as
   *  "until 9:47 PM" in the header's status slot while the stack's moment is the current one.
   *  Only ever set on that card, and only for sky moments (prayer moments carry no clock). */
  currentChapterUntil?: string;
};

/**
 * A stack rendered as the thing the app actually tracks: an anchored, ordered sequence you read
 * until you know it, and seal in one tap once you've done the whole of it.
 *
 * **The header is the commit.** Tapping the card seals the stack; tapping a sealed one re-opens
 * it — one meaning in either state, so the tap never changes under the user. There is no button
 * at the foot: the stack is the only unit the app tracks, so the card *is* the checkbox — and the
 * leading {@link CompletionRing} is where that reads, the ring sweeping shut around a check on the
 * seal. Underneath, sealing writes an ordinary done row per act (which is why Progress and
 * Stats need to know nothing about any of this).
 *
 * **Every stack is born folded**, and the trailing chevron unfolds it. Folded, the card is a
 * single bar carrying its mark, its name and — while its moment is the current one — the clock
 * that moment closes at, so a day reads as a short column of identical bars with one deadline in
 * it. Unfolding is for *reading* the sequence, which is the thing you do while you're still
 * learning it; it is not how you operate the card, and everything that *manages* the stack (the
 * "⋯") lives inside the fold, out of the way of the commit.
 *
 * In the Today grid the card takes part in the drag vocabulary: hold anywhere on it to lift and
 * reorder the whole stack, hold an act to move it within the sequence or into another stack.
 * On sealing, the border flashes ({@link StackCompleteFlash}) with a synced haptic, and the card
 * folds itself away a beat later — a finished stack recedes so the day's remaining work rises.
 */
function StackCardBase({
  stack,
  members,
  completed,
  skipped,
  settling = false,
  onSeal,
  onUnseal,
  onAct,
  onEditStack,
  onMove,
  onMoveHabit,
  onAddHabits,
  expanded,
  onSetExpanded,
  isCurrentChapter,
  currentChapterUntil,
}: Props) {
  const theme = useTheme();
  // The acts actually in play today — the excused drop out of the sequence the seal asserts
  // (the same rule `sealableActs` applies to the write, so the card and the row can't disagree).
  const openActs = members.filter((m) => !skipped.has(m.id));
  // The whole group sealed. Drives the one-shot border flash, the greyed header tone, the status
  // check and the auto-fold; the synced completion haptic is fired from the seal seam in use-habits.
  const stackComplete = isStackComplete(members, completed, skipped);
  // The clock is a claim about work still ahead, so it goes the moment the stack seals: a sealed
  // card recedes whole rather than keeping a deadline it has already met.
  const momentNow = !!isCurrentChapter && !stackComplete;
  // Any non-empty stack folds. The empty "Add your first act" card has nothing to hide.
  const collapsible = members.length > 0;

  const header = stackHeaderContract({
    name: stack.name,
    memberCount: members.length,
    openCount: openActs.length,
    sealed: stackComplete,
    lit: momentNow,
    until: currentChapterUntil,
  });

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

  // The header commits the group — or, on a stack with no acts yet, leads where its body row
  // leads. No haptic here: the seal's own beat is fired from the seam in use-habits.
  const onHeaderPress =
    header.mode === 'add'
      ? () => onAddHabits?.(stack.id)
      : stackComplete
        ? () => onUnseal(stack.id)
        : () => onSeal(stack.id);

  const clock = momentNow ? currentChapterUntil : undefined;

  // The stack's own door, written once. Both branches below close on it — the populated card puts
  // it behind the fold, the empty one has no fold to put it behind — and while it was spelled out
  // twice, a change to its wording or its hint had two places to land and only ever reached one.
  const manageStack = (
    <ManageRow
      label="Manage stack"
      accessibilityLabel={`Manage ${stack.name} stack`}
      accessibilityHint="Add acts, see insights, edit, or delete the stack."
      onPress={() => onEditStack(stack.id)}
    />
  );

  return (
    <View>
      <Surface>
        {/* `stretch`, not `center`: the two regions (seal / fold) then tile the whole bar at full
            height, with no dead strip above or below the chevron. */}
        <View style={styles.headerRow}>
          {/* Gesture-handler's `Touchable` rather than PressableScale: a scale on a flex-1 header
              would shrink the left 80% of a 56pt bar and leave the chevron behind, and
              this row lives inside the drag layer's pan — where the house rule (pressable-scale's
              own doc) is a background highlight, because a scale transform fights the gesture
              translate. The highlight is the bar's legend: the instant a finger lands it draws
              the invisible grouping, ending in a hard edge where the fold button begins. It also
              costs no re-render and yields to continuous gestures, so the card's 350ms lift still
              wins from the header. */}
          <Touchable
            onPress={onHeaderPress}
            disabled={!header.enabled}
            androidRipple={header.enabled ? { color: theme.backgroundSelected } : undefined}
            underlayColor={header.enabled ? theme.backgroundSelected : undefined}
            activeUnderlayOpacity={1}
            accessibilityRole={header.role}
            accessibilityLabel={header.label}
            accessibilityHint={header.hint}
            accessibilityState={
              header.checked === undefined ? undefined : { checked: header.checked, disabled: !header.enabled }
            }
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
            // full-bright title — a real-looking answer that just happens to be wrong for a
            // beat, which is what read as the mark and text "flashing white" on a day-step. Dim
            // the whole header instead of asserting either state while the day's real truth is
            // still in flight; the seal/title colors themselves land correctly the moment it does.
            style={[styles.header, settling && styles.settling]}>
            {/* The commit's mark, in the same 32-wide slot the act rows give their numerals, so it
                sits directly above them and the title lines up with the act names. An all-excused
                stack has nothing to assert, so it shows the skip glyph in place of a ring it
                couldn't fill. */}
            <View style={styles.leading}>
              {header.mode === 'excused' ? (
                <AppIcon name="skip" size={20} color={theme.textSecondary} />
              ) : (
                <CompletionRing complete={stackComplete} size={24} strokeWidth={2} settling={settling} />
              )}
            </View>
            <ThemedText
              type="rowTitle"
              style={[styles.title, stackComplete && { color: theme.textDisabled }]}
              numberOfLines={1}>
              {stack.name}
            </ThemedText>
            {/* Why this card is the one to look at: the clock its moment closes at. Tabular so it
                doesn't dance as the minute turns. flexShrink 0 — Android clips trailing flex-row
                text otherwise (the "Undo"→"Und" gotcha). */}
            {clock ? (
              <View style={styles.status}>
                <ThemedText type="smallCompact" themeColor="textSecondary">
                  {`until ${clock}`}
                </ThemedText>
              </View>
            ) : null}
          </Touchable>

          {/* The disclosure — the bar's only other verb. No count beside it: how many lines a fold
              hides is bookkeeping, and a number on the bar invites reading it as progress — the
              mental model the stacks-only rewrite dropped. */}
          {collapsible ? (
            <FoldToggle
              expanded={expanded}
              onPress={() => onSetExpanded(stack.id, !expanded)}
              label={`${stack.name} acts`}
              hint={expanded ? 'Collapses the stack.' : 'Expands the stack to read its acts.'}
            />
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
                    // leave a hole in the sequence you're learning.
                    ordinal={openActs.findIndex((m) => m.id === habit.id) + 1}
                    done={completed.has(habit.id)}
                    skipped={skipped.has(habit.id)}
                    onPress={onAct}
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
  headerRow: {
    flexDirection: 'row',
    // Both children run the full height of the bar, so the two regions tile it exactly. Paired
    // with the absence of `hitSlop` below: with two adjacent full-height targets, hit slop would
    // only overlap two different verbs 40dp apart.
    alignItems: 'stretch',
  },
  // The seal region. 56 rather than the old 44 is set by the drag engine: a card's "drop an act
  // into me" band is its frame inset top and bottom by 20% of its height, clamped to 12 — so a
  // 44pt bar joins on 20pt, while 56 gives 32pt, exactly what a full expanded card gets at the
  // clamp ceiling. It also lands the list on one repeat unit (56 + the grid's 8pt gap = 64) and
  // stops Radius.card from eating a third of the height per corner.
  header: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.three,
    // The floated trailing button's box, reserved so the title and clock stop where it begins. Kept
    // as one derived constant rather than a literal, so widening the button can't silently start
    // clipping names — and shared with the rows below, which reserve the same box for their `⋯`.
    paddingRight: TRAILING_BOX,
    paddingVertical: Spacing.two,
    minHeight: 56,
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
  // Spacing.three (not two) so the leading mark → title gap matches the act rows' numeral →
  // name gap, and the title lands in the same column as the act names below.
  title: { flex: 1, marginLeft: Spacing.three, fontFamily: Face.bodySemiBold },
  // The clock reads as part of the name ("Morning, until 09:41"), so it sits one proximity step
  // closer than the fold button beyond it.
  status: { marginLeft: Spacing.two, flexShrink: 0 },
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
// silently ignore its changes (`isCurrentChapter`/`currentChapterUntil` drive the status clock;
// `expanded` drives the fold, and without it the chevron would look dead).
function stackPropsEqual(a: Props, b: Props): boolean {
  if (
    a.stack.id !== b.stack.id ||
    a.stack.name !== b.stack.name ||
    a.expanded !== b.expanded ||
    a.onSetExpanded !== b.onSetExpanded ||
    a.isCurrentChapter !== b.isCurrentChapter ||
    a.currentChapterUntil !== b.currentChapterUntil ||
    // `settling` usually rides along with a fresh `completed` Set, but not always: a day-switch
    // whose completions fetch FAILS turns it off while leaving the blanked sets at their existing
    // identity. Skipping the re-render then strands this card's `wasSettling` guard (and its
    // children's) at `true`, and the next genuine seal plays no sweep, no border flash and no
    // auto-fold for the rest of the day.
    a.settling !== b.settling ||
    a.onSeal !== b.onSeal ||
    a.onUnseal !== b.onUnseal ||
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
      a.skipped.has(m.id) === b.skipped.has(n.id)
    );
  });
}

export const StackCard = memo(StackCardBase, stackPropsEqual);
