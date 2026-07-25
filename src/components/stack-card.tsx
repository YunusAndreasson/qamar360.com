import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
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
import { PressableScale } from '@/components/pressable-scale';
import { RowSeparator } from '@/components/row-separator';
import { StackCompleteFlash } from '@/components/stack-complete-flash';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Collapse, Duration } from '@/constants/motion';
import { Face, Pressed, Radius, Spacing } from '@/constants/theme';
import type { Habit, HabitStack } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { MOMENTS, momentOf, type MomentKey } from '@/lib/moments';
import { isStackComplete } from '@/lib/progress';

type Props = {
  stack: HabitStack;
  /** The stack's acts scheduled for the viewed day, in sequence order. */
  members: Habit[];
  completed: Set<string>;
  /** Ids of acts skipped (excused) for the viewed day. */
  skipped: Set<string>;
  /** Mark the whole stack done for the viewed day — the card's one completion control. */
  onSeal: (stackId: string) => void;
  /** Re-open a sealed stack. */
  onUnseal: (stackId: string) => void;
  /** Open one act's sheet (skip today / insights / edit / move). */
  onAct: (habit: Habit) => void;
  onEditStack: (stackId: string) => void;
  /** Screen-reader reorder for the whole stack (Move up / Move down on the header). */
  onMove?: (stackId: string, delta: -1 | 1) => void;
  /** Screen-reader reorder for an act within the stack (forwarded to each row). */
  onMoveHabit?: (habit: Habit, delta: -1 | 1) => void;
  /** Open the stack-scoped Add screen — the empty card's "Add your first act" row. */
  onAddHabits?: (stackId: string) => void;
  /** This stack's moment is current (its band matches the real sun's, or its Friday matches
   *  today) — its emblem lights up in the header. Computed once in the screen from
   *  `useSunCycle`; never read from a context here (that would bypass the memo below). */
  isCurrentChapter?: boolean;
  /** Preformatted local closing time of the current band ("21:47"), rendered as
   *  "until 21:47" beside the title while the emblem is lit — so the lighting explains
   *  itself. Only ever set on the lit sky-moment card (prayer moments carry no clock). */
  currentChapterUntil?: string;
};

/**
 * A stack rendered as the thing the app actually tracks: an anchored, ordered sequence you read
 * until you know it, and seal in one tap when you've done the whole of it.
 *
 * The card is therefore mostly *text*. Its acts are numbered lines, not checkboxes — nothing
 * inside can be ticked, because completing half a stack is not the behaviour the app is trying
 * to build. A single control at the foot commits the group; underneath, that writes an ordinary
 * done row per act, which is why Progress and Insights need to know nothing about any of this.
 *
 * In the Today grid the card takes part in the drag vocabulary: hold anywhere on it to lift and
 * reorder the whole stack, hold an act to move it within the sequence or into another stack.
 * On sealing, the border flashes the "done" tone ({@link StackCompleteFlash}) with a synced
 * haptic, and the card folds itself into a quiet grey bar carrying "✓ N" — a finished stack
 * recedes so the day's remaining work rises. The title tap folds and unfolds in either state
 * (so a sealed stack can always be re-read); undoing lives on the expanded card's own button,
 * never on the bar — the tap must not change meaning under the user.
 */
function StackCardBase({ stack, members, completed, skipped, onSeal, onUnseal, onAct, onEditStack, onMove, onMoveHabit, onAddHabits, isCurrentChapter, currentChapterUntil }: Props) {
  const theme = useTheme();
  const reduceMotion = useReducedMotion();
  // The acts actually in play today — the excused drop out of the sequence the seal asserts
  // (the same rule `sealableActs` applies to the write, so the card and the row can't disagree).
  const openActs = members.filter((m) => !skipped.has(m.id));
  // The whole group sealed. Drives the one-shot border flash, the greyed header tone, and the
  // auto-collapse; the synced completion haptic is fired from the seal seam in use-habits.
  const stackComplete = isStackComplete(members, completed, skipped);
  // The emblem lights only while the stack is still open: a sealed stack keeps its greyed
  // glyph — the recede is the stronger statement than the light.
  const emblemLit = !!isCurrentChapter && !stackComplete;
  // Any non-empty stack can be folded away by hand; a sealed one folds itself. The empty
  // "Add your first act" card has nothing to collapse.
  const collapsible = members.length > 0;

  // Born collapsed if the card loads already sealed, so a cold start of a finished stack shows the
  // grey bar with no animation — mirroring StackCompleteFlash's already-complete no-op.
  const [collapsed, setCollapsed] = useState(stackComplete);

  // Fold shut / open on the seal edge, mirroring StackCompleteFlash's `wasComplete` guard. A
  // genuine seal holds a beat first (Collapse.lead) — the border flash plays out — THEN the whole
  // card folds, so the collapsed look appears *with* the fold rather than racing ahead of a
  // still-open body. Un-sealing re-opens at once.
  const wasComplete = useRef(stackComplete);
  useEffect(() => {
    if (wasComplete.current === stackComplete) return;
    wasComplete.current = stackComplete;
    const timer = setTimeout(() => setCollapsed(stackComplete), stackComplete ? Collapse.lead : 0);
    return () => clearTimeout(timer);
  }, [stackComplete]);

  // The body's animated clip. `progress` 1 = open, 0 = folded: height interpolates the measured
  // content height and opacity fades the rows as it shuts. Born at rest so the first frame is
  // already correct (no mount flash).
  const progress = useSharedValue(collapsed ? 0 : 1);
  const contentH = useSharedValue(0);
  // The clip animates a concrete height, which needs the content measured first. Until then the
  // body renders unclipped so onLayout can read its natural height — or, if the card loads already
  // folded, it simply isn't mounted (nothing to clip, no flash), and gets measured on first expand.
  const [measured, setMeasured] = useState(false);
  const showBody = measured || !collapsed;
  const firstRun = useRef(true);
  useEffect(() => {
    const target = collapsed ? 0 : 1;
    if (firstRun.current) {
      firstRun.current = false;
      progress.set(target);
      return;
    }
    // Can't animate a height we haven't measured yet (a card that loaded folded): jump to the
    // target this once — the body mounts at its natural height and measures — then animate from
    // then on. Reduce Motion always jumps. The seal's "hold a beat" lives in the collapse edge (a
    // delayed setCollapsed), so the fold itself is prompt: folding and the header's look land together.
    if (reduceMotion || !measured) {
      progress.set(target);
      return;
    }
    progress.set(withTiming(target, { duration: Collapse.duration, easing: Easing.inOut(Easing.quad) }));
  }, [collapsed, measured, reduceMotion, progress]);

  // Once measured, always drive a concrete height — never omit it. Reanimated keeps the last value
  // a style stops setting, so dropping the height (or setting `undefined`) would strand the body at
  // its folded 0. Before measuring, `bodyStyle` isn't applied (the body is unclipped, auto height).
  const bodyStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return { height: p * contentH.get(), opacity: p };
  });
  const onContentLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) {
      contentH.set(h);
      if (!measured) setMeasured(true);
    }
  };

  // A light "movement" tick for a hand toggle — the disclosure-adjacent haptic (never a heavier
  // impact; those stay reserved for the completion seal). Auto-collapse stays silent: it rides the
  // stack's existing seal beat.
  const toggleCollapsed = () => {
    haptics.selection();
    setCollapsed((c) => !c);
  };

  return (
    <View>
      <Surface>
        <View style={styles.headerRow}>
          {/* Tapping the title folds / unfolds the stack — the same gesture in either state, so the
              tap never changes meaning. Managing it (edit / delete / add acts) lives on the
              trailing "⋯". An empty card has nothing to fold: its header opens manage instead. */}
          <PressableScale
            onPress={collapsible ? toggleCollapsed : () => onEditStack(stack.id)}
            android_ripple={{ color: theme.backgroundSelected }}
            accessibilityRole="button"
            accessibilityLabel={`${stack.name} stack${stackComplete ? ', sealed' : ''}${emblemLit ? `, current time of day${currentChapterUntil ? ` until ${currentChapterUntil}` : ''}` : ''}${collapsed ? ', collapsed' : ''}`}
            accessibilityState={collapsible ? { expanded: !collapsed } : undefined}
            accessibilityHint={
              !collapsible
                ? 'Activates to manage the stack. Hold and drag to reorder it.'
                : collapsed
                  ? 'Activates to expand the stack. Hold and drag to reorder it.'
                  : 'Activates to collapse the stack. Hold and drag to reorder it.'
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
                sits directly above them and the title lines up with the act names. An anchored
                stack wears its moment's emblem (lib/moments.ts) in a muted tone — identity, never
                a "now" claim — and the current moment's emblem lights up instead (see
                LeadingGlyph). Every glyph greys once sealed, receding with its muted rows. */}
            <LeadingGlyph moment={momentOf(stack)} lit={emblemLit} complete={stackComplete} />
            <ThemedText
              type="rowTitle"
              style={[styles.title, stackComplete && { color: theme.textDisabled }]}
              numberOfLines={1}>
              {stack.name}
            </ThemedText>
            {/* Why the emblem is lit: the chapter's closing time. Quiet trailing meta inside the
                same fold-toggle target. flexShrink 0 — Android clips trailing flex-row text
                otherwise (the "Undo"→"Und" gotcha). */}
            {emblemLit && currentChapterUntil ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.trailing}>
                {`until ${currentChapterUntil}`}
              </ThemedText>
            ) : null}
            {/* Folded: what the card is hiding. Sealed reads "✓ 4" — the acts no longer carry
                their own checkmarks, so this bar is the only place the count is stated. */}
            {collapsed && collapsible ? (
              <ThemedText type="small" themeColor="textDisabled" style={styles.trailing}>
                {stackComplete ? `✓ ${openActs.length}` : `${members.length}`}
              </ThemedText>
            ) : null}
          </PressableScale>
          {/* The manage affordance — a quiet "⋯" opening edit / delete / add-acts, reachable in
              any state (its own tap target + a11y button, a sibling so a screen reader gets it apart
              from the header's fold toggle). */}
          <Pressable
            onPress={() => onEditStack(stack.id)}
            hitSlop={8}
            android_ripple={{ color: theme.backgroundSelected, borderless: true }}
            accessibilityRole="button"
            accessibilityLabel={`Manage ${stack.name} stack`}
            accessibilityHint="Edit, delete, or add acts."
            style={({ pressed }) => [styles.manage, pressed && { opacity: Pressed.dim }]}>
            <AppIcon name="ellipsis" size={18} color={theme.textDisabled} />
          </Pressable>
        </View>

        {/* The body folds shut when the stack seals (or is hand-collapsed): an overflow-clipped
            wrapper whose height + opacity ride `progress`. The header stays outside the clip so the
            bar is always tappable. `bodyStyle` applies only once measured (before that the body is
            unclipped so onLayout can read its natural height); a card loaded already-folded skips
            the body entirely and mounts it on first expand. */}
        <Animated.View style={[styles.collapseClip, measured && bodyStyle]}>
          {showBody ? (
            <View onLayout={onContentLayout}>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              {members.length === 0 ? (
                // A brand-new stack waiting on its first act ("+ → Build your own stack"): the next
                // step lives inside the card itself. Accent-tinted like the header — an invitation,
                // not an act line. (An act dragged onto the card also joins it, as always.)
                <Pressable
                  onPress={() => onAddHabits?.(stack.id)}
                  android_ripple={{ color: theme.backgroundSelected }}
                  accessibilityRole="button"
                  accessibilityLabel={`Add your first act to ${stack.name}`}
                  style={({ pressed }) => [styles.addFirst, pressed && { backgroundColor: theme.backgroundSelected }]}>
                  {/* Same 32-wide leading slot as the header glyph and the act numerals, so the +
                      sits directly under the stack icon and the label lines up with the title. */}
                  <View style={styles.leading}>
                    <AppIcon name="add" size={26} color={theme.accent} />
                  </View>
                  <ThemedText type="rowTitle" themeColor="accent">
                    Add your first act
                  </ThemedText>
                </Pressable>
              ) : (
                <>
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
                  <SealButton
                    stackName={stack.name}
                    count={openActs.length}
                    complete={stackComplete}
                    onSeal={() => onSeal(stack.id)}
                    onUnseal={() => onUnseal(stack.id)}
                  />
                </>
              )}
            </View>
          ) : null}
        </Animated.View>
      </Surface>
      {/* Sibling of the Surface (not a child — the Surface clips its content), so the 2px border
          overlays the whole card at its rounded rect and flashes when the stack seals. */}
      <StackCompleteFlash complete={stackComplete} />
    </View>
  );
}

/**
 * The card's single completion control — the whole point of the screen. It asserts the *group*:
 * "I did all of it", which is the claim the app is built to collect, and the reason no act above
 * it is tappable.
 *
 * A stack whose every act is excused today has nothing to assert, so it states that plainly
 * instead of offering a button that would write nothing. Once sealed, the control becomes the
 * way back out — undo lives here on the expanded card, not on the folded bar, so the bar's tap
 * keeps meaning "open me".
 */
function SealButton({
  stackName,
  count,
  complete,
  onSeal,
  onUnseal,
}: {
  stackName: string;
  count: number;
  complete: boolean;
  onSeal: () => void;
  onUnseal: () => void;
}) {
  const theme = useTheme();

  if (count === 0) {
    return (
      <View style={styles.sealFoot}>
        <ThemedText type="small" themeColor="textSecondary">
          Every act excused today
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.sealFoot}>
      <PressableScale
        onPress={complete ? onUnseal : onSeal}
        android_ripple={{ color: theme.backgroundSelected }}
        accessibilityRole="button"
        accessibilityLabel={complete ? `Undo ${stackName}` : `Done, all of ${stackName}`}
        accessibilityHint={
          complete
            ? 'Re-opens the stack for today.'
            : `Marks all ${count} act${count === 1 ? '' : 's'} done for today.`
        }
        style={[
          styles.seal,
          complete
            ? { borderColor: theme.border }
            : { backgroundColor: theme.accentSubtle, borderColor: theme.accentSubtle },
        ]}>
        <AppIcon
          name={complete ? 'undo' : 'check'}
          size={18}
          color={complete ? theme.textSecondary : theme.accent}
        />
        {/* One word. There is nothing else on the card to complete, so "Done" can't be misread as
            a per-act tick — and a button that carries the day's only commitment should say it
            plainly rather than explain itself. */}
        <ThemedText type="rowTitle" themeColor={complete ? 'textSecondary' : 'accent'} style={styles.sealLabel}>
          {complete ? 'Undo' : 'Done'}
        </ThemedText>
      </PressableScale>
    </View>
  );
}

/**
 * The header's leading glyph slot. An un-anchored stack shows the accent stack icon, as ever.
 * An anchored stack wears its moment's emblem in the muted secondary tone — the emblem is
 * *identity*, worn always (Night wears the moon at 8am and 11:30pm alike; "Going to bed" and
 * "ʿIshāʾ" wear different moons), never a "now" claim — and while the stack's moment is
 * current the emblem *lights up*: warm star-cream by day, starlight in the night band (never
 * the completion gold — warmth must not read as achievement). Icon = meaning, light = now, so
 * a lit moon at 11:30pm reads instantly. The lit overlay cross-fades only on an actual
 * arrival/departure — a card that MOUNTS lit shows it at rest, no animation (the `wasLit`
 * edge guard, mirroring StackCompleteFlash) — so day-steps, drags and list churn never replay
 * the transition. The slot keeps its fixed 32-width in every state: card height never
 * changes, so the drag grid's measured frames stay valid.
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
        <AppIcon name="stack" size={26} color={complete ? theme.textDisabled : theme.accent} />
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
    alignItems: 'center',
  },
  header: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    // Spacing.three (not two) so the leading glyph → title gap matches the act rows'
    // numeral → name gap — the title lands in the same column as the act names below.
    gap: Spacing.three,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.two,
    // The card's primary control (fold/unfold) meets the 44pt target.
    minHeight: 44,
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
  title: { flex: 1, fontFamily: Face.bodySemiBold },
  // Trailing header meta ("until 21:47", "✓ 4") — flexShrink 0 so Android can't clip it
  // (the "Und" gotcha).
  trailing: { flexShrink: 0 },
  // The trailing "⋯" manage button's tap area; its own right-edge padding stands in for the header's.
  manage: {
    paddingLeft: Spacing.two,
    paddingRight: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Clips the body as it folds shut; the measured content sits inside in normal flow.
  collapseClip: { overflow: 'hidden' },
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
  // Sets the seal apart from the sequence it commits: full side gutters, and enough space above
  // that it reads as the card's conclusion rather than one more line to read.
  sealFoot: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    alignItems: 'center',
  },
  seal: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 48,
    borderRadius: Radius.control,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // Semibold via the FACE (never fontWeight beside a registered family — the Android fake-bold
  // gotcha): the card's one commitment should carry a little more weight than the lines above it.
  sealLabel: { fontFamily: Face.bodySemiBold },
});

// Memoized on what the card paints. Like ActRow, a reorder re-stamps every act's `position` into a
// fresh object and `entries` hands over a fresh `members` array each render — so the default
// identity compare would rebuild the whole card (every act's drag subtree) on the frame a drop
// commits. Compare the rendered stack fields, the members by the fields their rows read, and the
// day-state Sets + callbacks by identity (a seal swaps the Set identity, so completions still land).
// The collapse/fold is local component state, not a prop, so it needs no entry here.
// KEEP IN SYNC: any newly *rendered* stack field or prop must be compared here, or the card will
// silently ignore its changes (`moment`/`day_part`/`isCurrentChapter`/`currentChapterUntil` drive
// the moment emblem, its lighting, and the "until" caption).
function stackPropsEqual(a: Props, b: Props): boolean {
  if (
    a.stack.id !== b.stack.id ||
    a.stack.name !== b.stack.name ||
    a.stack.moment !== b.stack.moment ||
    a.stack.day_part !== b.stack.day_part ||
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
