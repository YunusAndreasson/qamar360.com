import { memo, useEffect, useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Touchable } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ActRow } from '@/components/act-row';
import { AppIcon } from '@/components/app-icon';
import { DraggableMemberRow } from '@/components/habit-drag';
import { RowSeparator } from '@/components/row-separator';
import { StackCompleteFlash } from '@/components/stack-complete-flash';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Collapse, Duration } from '@/constants/motion';
import { Face, Pressed, Spacing } from '@/constants/theme';
import type { Habit, HabitStack } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { MOMENTS, momentOf, type MomentKey } from '@/lib/moments';
import { isStackComplete } from '@/lib/progress';
import { stackHeaderContract, type StackHeaderMode } from '@/lib/stack-card-state';

type Props = {
  stack: HabitStack;
  /** The stack's acts scheduled for the viewed day, in sequence order. */
  members: Habit[];
  completed: Set<string>;
  /** Ids of acts skipped (excused) for the viewed day. */
  skipped: Set<string>;
  /** Mark the whole stack done for the viewed day — fired by a tap on the header. */
  onSeal: (stackId: string) => void;
  /** Re-open a sealed stack — fired by a tap on the header of a sealed one. */
  onUnseal: (stackId: string) => void;
  /** Open one act's sheet (skip today / insights / edit / move). */
  onAct: (habit: Habit) => void;
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
   *  today) — its emblem lights up in the header. Computed once in the screen from
   *  `useSunCycle`; never read from a context here (that would bypass the memo below). */
  isCurrentChapter?: boolean;
  /** Preformatted local closing time of the current band ("9:47 PM"), rendered as
   *  "until 9:47 PM" in the header's status slot while the emblem is lit — so the lighting
   *  explains itself. Only ever set on the lit sky-moment card (prayer moments carry no clock). */
  currentChapterUntil?: string;
};

/**
 * A stack rendered as the thing the app actually tracks: an anchored, ordered sequence you read
 * until you know it, and seal in one tap once you've done the whole of it.
 *
 * **The header is the commit.** Tapping the card seals the stack; tapping a sealed one re-opens
 * it — one meaning in either state, so the tap never changes under the user. There is no button
 * at the foot: the stack is the only unit the app tracks, so the card *is* the checkbox, and
 * underneath, sealing writes an ordinary done row per act (which is why Progress and Insights
 * need to know nothing about any of this).
 *
 * **Every stack is born folded**, and the trailing chevron unfolds it. Folded, the card is a
 * single bar carrying its emblem, its name, one status mark and the count of what it's hiding —
 * so a day reads as a short column of identical bars, and one lit emblem in that column is
 * finally pre-attentive. Unfolding is for *reading* the sequence, which is the thing you do
 * while you're still learning it; it is not how you operate the card.
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
  const reduceMotion = useReducedMotion();
  // The acts actually in play today — the excused drop out of the sequence the seal asserts
  // (the same rule `sealableActs` applies to the write, so the card and the row can't disagree).
  const openActs = members.filter((m) => !skipped.has(m.id));
  // The whole group sealed. Drives the one-shot border flash, the greyed header tone, the status
  // check and the auto-fold; the synced completion haptic is fired from the seal seam in use-habits.
  const stackComplete = isStackComplete(members, completed, skipped);
  // The emblem lights only while the stack is still open: a sealed stack keeps its greyed
  // glyph — the recede is the stronger statement than the light.
  const emblemLit = !!isCurrentChapter && !stackComplete;
  // Any non-empty stack folds. The empty "Add your first act" card has nothing to hide.
  const collapsible = members.length > 0;

  const header = stackHeaderContract({
    name: stack.name,
    memberCount: members.length,
    openCount: openActs.length,
    sealed: stackComplete,
    lit: emblemLit,
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
  useEffect(() => {
    if (wasComplete.current === stackComplete) return;
    wasComplete.current = stackComplete;
    if (!stackComplete) return;
    const timer = setTimeout(() => onSetExpanded(stack.id, false), Collapse.lead);
    return () => clearTimeout(timer);
  }, [stackComplete, stack.id, onSetExpanded]);

  // The body's animated clip. `progress` 1 = open, 0 = folded: height interpolates the measured
  // content height and opacity fades the rows as it shuts. Born at rest so the first frame is
  // already correct — which is also what keeps the drag ghost from animating open on lift.
  const progress = useSharedValue(expanded ? 1 : 0);
  const contentH = useSharedValue(0);
  const firstRun = useRef(true);
  useEffect(() => {
    const target = expanded ? 1 : 0;
    if (firstRun.current) {
      firstRun.current = false;
      progress.set(target);
      return;
    }
    if (reduceMotion) {
      progress.set(target);
      return;
    }
    progress.set(withTiming(target, { duration: Collapse.duration, easing: Easing.inOut(Easing.quad) }));
  }, [expanded, reduceMotion, progress]);

  // ALWAYS a concrete height, from the very first frame — never a conditionally-applied style.
  // Reanimated keeps the last value a style stops setting, so a height that came and went would
  // strand the body at its folded 0. Before the first onLayout, `contentH` is 0 and the card is
  // folded, so 0 × 0 = 0 is already the correct paint: no mount flash, and no "unclipped until
  // measured" special case. The body stays MOUNTED while folded (see the render) precisely so
  // onLayout can keep reporting its natural height — a child of a height-0 column parent keeps
  // its content height (RN's default flexShrink is 0; overflow:hidden is paint, not layout) —
  // which is what lets the very first unfold animate like every later one.
  const bodyStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return { height: p * contentH.get(), opacity: p };
  });
  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) contentH.set(h);
  };

  // The header commits the group — or, on a stack with no acts yet, leads where its body row
  // leads. No haptic here: the seal's own beat is fired from the seam in use-habits.
  const onHeaderPress =
    header.mode === 'add'
      ? () => onAddHabits?.(stack.id)
      : stackComplete
        ? () => onUnseal(stack.id)
        : () => onSeal(stack.id);

  // The lit card trades its count for its clock: at 360dp a 12-hour clock plus a count leaves
  // the title ~9 characters. A closed card states one number at a time, and the lit card's
  // number is its deadline.
  const clock = emblemLit ? currentChapterUntil : undefined;
  const showCount = !expanded && header.count !== null && !clock;

  return (
    <View>
      <Surface>
        {/* `stretch`, not `center`: the three regions (seal / fold / manage) then tile the whole
            bar at full height, with no dead strip above or below the trailing glyphs. */}
        <View style={styles.headerRow}>
          {/* Gesture-handler's `Touchable` rather than PressableScale: a scale on a flex-1 header
              would shrink the left 70% of a 56pt bar and leave the chevron and "⋯" behind, and
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
            style={styles.header}>
            {/* The leading glyph in the same 32-wide slot the act rows give their numerals, so it
                sits directly above them and the title lines up with the act names. */}
            <LeadingGlyph moment={momentOf(stack)} lit={emblemLit} complete={stackComplete} />
            <ThemedText
              type="rowTitle"
              style={[styles.title, stackComplete && { color: theme.textDisabled }]}
              numberOfLines={1}>
              {stack.name}
            </ThemedText>
            <StatusMark mode={header.mode} sealed={stackComplete} until={clock} />
          </Touchable>

          {/* The disclosure. The count lives INSIDE this target on purpose: bound to the chevron
              by 4pt but belonging to the header's target, a finger aimed at "3 ⌄" that landed on
              the 3 would seal the stack. Any pixel that looks like the disclosure behaves like
              it. The number means "3 lines are hidden behind this fold" — a property of the fold,
              not of the stack — which is why it shows only while folded: once open, the acts are
              numbered 1..n and the last ordinal IS the count. Tabular, in the same voice as those
              ordinals, so unfolding hands the number down into their column. */}
          {collapsible ? (
            <Touchable
              onPress={() => onSetExpanded(stack.id, !expanded)}
              androidRipple={{ color: theme.backgroundSelected, borderless: true }}
              activeOpacity={Pressed.dim}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              // A stable label — `expanded` says which way it goes, and a label that flipped too
              // would have a screen reader announce the state twice.
              accessibilityLabel={`${stack.name} acts`}
              accessibilityHint={expanded ? 'Collapses the stack.' : 'Expands the stack to read its acts.'}
              style={styles.fold}>
              {showCount ? (
                <ThemedText type="smallCompact" themeColor="textDisabled" style={styles.count}>
                  {header.count}
                </ThemedText>
              ) : null}
              <AppIcon name={expanded ? 'expandLess' : 'expandMore'} size={18} color={theme.textDisabled} />
            </Touchable>
          ) : null}

          {/* The manage affordance — a quiet "⋯" opening edit / delete / add-acts, reachable in
              any state (its own tap target + a11y button, a sibling so a screen reader gets it
              apart from the header's seal). */}
          <Touchable
            onPress={() => onEditStack(stack.id)}
            androidRipple={{ color: theme.backgroundSelected, borderless: true }}
            // Platform-side dim, the same value the old `pressed && { opacity }` style used.
            activeOpacity={Pressed.dim}
            accessibilityRole="button"
            accessibilityLabel={`Manage ${stack.name} stack`}
            accessibilityHint="Edit, delete, or add acts."
            style={styles.manage}>
            <AppIcon name="ellipsis" size={18} color={theme.textDisabled} />
          </Touchable>
        </View>

        {collapsible ? (
          // The body folds shut: an overflow-clipped wrapper whose height + opacity ride
          // `progress`. The header stays outside the clip so the bar is always tappable. A folded
          // body is still MOUNTED and laid out — that is what keeps it measured — so it has to be
          // taken out of the hit test and the a11y tree by hand, or every folded card's acts stay
          // reachable by VoiceOver/TalkBack.
          <Animated.View
            style={[styles.collapseClip, bodyStyle]}
            pointerEvents={expanded ? 'auto' : 'none'}
            accessibilityElementsHidden={!expanded}
            importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}>
            <View onLayout={onContentLayout} style={styles.bodyContent}>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              {members.map((habit, index) => (
                <View key={habit.id}>
                  {/* Inset row divider — the same inset-grouped-list rule as the Settings sections. */}
                  {index > 0 ? <RowSeparator /> : null}
                  {/* Hold and drag an act to move it within the sequence, or into another stack. */}
                  <DraggableMemberRow habitId={habit.id} parentStackId={stack.id} memberIndex={index}>
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
                </View>
              ))}
            </View>
          </Animated.View>
        ) : (
          // A brand-new stack waiting on its first act: the next step lives inside the card
          // itself. Deliberately NOT the animated clip — nothing here folds, and an animated
          // height driven from an unmeasured `contentH` would paint one frame at 0 and pop.
          <View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
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
          </View>
        )}
      </Surface>
      {/* Sibling of the Surface (not a child — the Surface clips its content), so the 2px border
          overlays the whole card at its rounded rect and flashes when the stack seals. Around a
          folded bar this ring is the seal's main confirmation, and proportionally far louder than
          it ever was around a full card. */}
      <StackCompleteFlash complete={stackComplete} />
    </View>
  );
}

/**
 * The header's one status mark, in a slot pinned to the right of the title — so as a day fills
 * in, the marks stack up on a single meridian instead of scattering.
 *
 * The three states are mutually exclusive by construction (a sealed stack is never lit; an
 * all-excused stack is never sealed), which lets one narrow slot carry all of them. **A partially
 * done stack shows nothing** — no "2/3": a progress reading on the bar would resurrect exactly
 * the mental model the app dropped when it deleted per-act ticking.
 *
 * The check is the card's entire warm budget. `complete` is licensed for "the done check" and
 * forbidden on body text — and warming the title would invert the list's reading order outright,
 * since `complete` is *more* luminous than `text` in the dark theme. So the sealed card still
 * says "done" by receding; this 14pt mark is what explains the grey on the second pass.
 */
function StatusMark({ mode, sealed, until }: { mode: StackHeaderMode; sealed: boolean; until?: string }) {
  const theme = useTheme();
  const mark =
    mode === 'excused' ? (
      // Circle-enclosed, so it carries at 16 where a bare check carries at 14 — the same optical
      // sizing the act rows already use for this pair.
      <AppIcon name="skip" size={16} color={theme.textSecondary} />
    ) : sealed ? (
      <AppIcon name="check" size={14} color={theme.complete} />
    ) : until ? (
      // Why the emblem is lit: the chapter's closing time. Tabular so it doesn't dance as the
      // minute turns.
      <ThemedText type="smallCompact" themeColor="textSecondary">
        {`until ${until}`}
      </ThemedText>
    ) : null;
  if (!mark) return null;
  // flexShrink 0 — Android clips trailing flex-row text otherwise (the "Undo"→"Und" gotcha).
  return <View style={styles.status}>{mark}</View>;
}

/**
 * The header's leading glyph slot. An un-anchored stack shows the stack icon in the muted
 * secondary tone — in a column of folded bars a luminous accent emblem would be a second
 * attractor competing with the lit one, and it marks no distinction anyway (every card is
 * interactive); "this stack has no moment" is already carried by the glyph's *shape*.
 *
 * An anchored stack wears its moment's emblem, also muted — the emblem is *identity*, worn always
 * (Night wears the moon at 8am and 11:30pm alike; "Going to bed" and "ʿIshāʾ" wear different
 * moons), never a "now" claim — and while the stack's moment is current the emblem *lights up*:
 * warm star-cream by day, starlight in the night band (never the completion gold — warmth must
 * not read as achievement). Icon = meaning, light = now, so a lit moon at 11:30pm reads
 * instantly. The lit overlay cross-fades only on an actual arrival/departure — a card that MOUNTS
 * lit shows it at rest, no animation (the `wasLit` edge guard, mirroring StackCompleteFlash) — so
 * day-steps, drags and list churn never replay the transition. The slot keeps its fixed 32-width
 * in every state: card height never changes, so the drag grid's measured frames stay valid.
 */
function LeadingGlyph({ moment, lit, complete }: { moment: MomentKey | null; lit: boolean; complete: boolean }) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  // Born at rest at the current value; animated only on the lit-flips-edge below.
  const presence = useSharedValue(lit ? 1 : 0);
  const wasLit = useRef(lit);
  useEffect(() => {
    if (wasLit.current === lit) return;
    wasLit.current = lit;
    if (reduceMotion) {
      presence.set(lit ? 1 : 0);
      return;
    }
    presence.set(withTiming(lit ? 1 : 0, { duration: Duration.slow, easing: Easing.inOut(Easing.quad) }));
  }, [lit, reduceMotion, presence]);
  const mutedStyle = useAnimatedStyle(() => ({ opacity: 1 - presence.get() }));
  const litStyle = useAnimatedStyle(() => ({ opacity: presence.get() }));

  if (!moment) {
    return (
      <View style={styles.leading}>
        <AppIcon name="stack" size={26} color={complete ? theme.textDisabled : theme.textSecondary} />
      </View>
    );
  }
  const def = MOMENTS[moment];
  return (
    <View style={styles.leading}>
      <Animated.View style={mutedStyle}>
        <AppIcon name={def.icon} size={24} color={complete ? theme.textDisabled : theme.textSecondary} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.leadingOverlay, litStyle]} pointerEvents="none">
        <AppIcon name={def.icon} size={24} color={def.band === 'night' ? theme.starlight : theme.sun} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A bare `Surface` card (radius/border/bg come from Surface) — no margins: the drag grid
  // measures the bare item, so spacing comes from the grid's `gap` + its padding.
  headerRow: {
    flexDirection: 'row',
    // Every child runs the full height of the bar, so the three regions tile it exactly. Paired
    // with the absence of `hitSlop` below: with three adjacent full-height targets, hit slop
    // would only overlap three different verbs 40dp apart.
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
    paddingVertical: Spacing.two,
    minHeight: 56,
  },
  // Leading glyph slot — the same 32-wide box an ActRow gives its numeral, so the stack
  // emblem centers on the column below it.
  leading: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Centers the lit emblem over the muted one inside the fixed slot (it overlays, never
  // widens — see LeadingGlyph).
  leadingOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sized to the act rows (rowTitle, 17pt) so the stack's own name never reads smaller than the
  // acts it holds; the semibold weight + leading emblem mark it as the header.
  // Semibold via the FACE, never fontWeight: a weight override beside rowTitle's registered
  // family would silently fall back to Roboto on Android (the theme.ts fake-bold gotcha).
  // flex 1 — with four siblings competing for the row, the title is the one that gives way.
  // Spacing.three (not two) so the leading glyph → title gap matches the act rows' numeral →
  // name gap, and the title lands in the same column as the act names below.
  title: { flex: 1, marginLeft: Spacing.three, fontFamily: Face.bodySemiBold },
  // The status mark reads as part of the name ("Morning, until 09:41" / "Before sleep, done"),
  // so it sits one proximity step closer than the chrome rail beyond it.
  status: { marginLeft: Spacing.two, flexShrink: 0 },
  // The proximity ladder that keeps four trailing items from reading as four peers: 4 between
  // the count and its chevron (one word), against 24 before them (a zone break). The 6:1 ratio
  // is what makes "3 ⌄" unmistakably one thing and the rail beyond it another. The wide gap is
  // this button's paddingLeft rather than the header's paddingRight on purpose — a finger that
  // lands in the ambiguous space folds the card (free) instead of sealing it (writes a row per
  // act).
  fold: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingLeft: Spacing.four,
    paddingRight: Spacing.two,
  },
  count: { flexShrink: 0 },
  // The trailing "⋯" manage button's tap area; its own right-edge padding stands in for the
  // header's.
  manage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: Spacing.two,
    paddingRight: Spacing.three,
  },
  // Clips the body as it folds shut; the measured content sits inside in normal flow.
  collapseClip: { overflow: 'hidden' },
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
// day-state Sets + callbacks by identity (a seal swaps the Set identity, so completions still land).
// KEEP IN SYNC: any newly *rendered* stack field or prop must be compared here, or the card will
// silently ignore its changes (`moment`/`day_part`/`isCurrentChapter`/`currentChapterUntil` drive
// the moment emblem, its lighting and the status clock; `expanded` drives the fold, and without it
// the chevron would look dead).
function stackPropsEqual(a: Props, b: Props): boolean {
  if (
    a.stack.id !== b.stack.id ||
    a.stack.name !== b.stack.name ||
    a.stack.moment !== b.stack.moment ||
    a.stack.day_part !== b.stack.day_part ||
    a.expanded !== b.expanded ||
    a.onSetExpanded !== b.onSetExpanded ||
    a.isCurrentChapter !== b.isCurrentChapter ||
    a.currentChapterUntil !== b.currentChapterUntil ||
    a.completed !== b.completed ||
    a.skipped !== b.skipped ||
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
      m.target_unit === n.target_unit
    );
  });
}

export const StackCard = memo(StackCardBase, stackPropsEqual);
