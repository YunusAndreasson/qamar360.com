import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, {
  measure,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useScrollOffset,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { Duration, Spring } from '@/constants/motion';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  displacementFor,
  edgeScrollVelocity,
  keyAtCompactIndex,
  resolveDropSlot,
  slotTopForIndex,
  slotTopForKeys,
  SLOT_HYSTERESIS,
  type DragKind,
  type DropSlot,
  type EntryKind,
  type Frame,
  type OrderMeta,
} from '@/lib/drag-order';
import { haptics } from '@/lib/haptics';

/**
 * The Today list's unified drag — one long-press vocabulary for organising habits, in the
 * Reminders/Things mould:
 *
 *  - lift a standalone habit and drop it *between* entries to reorder, or onto a stack
 *    card's body to join that stack (the card lights an accent ring);
 *  - lift a whole stack card and drop it between entries to reorder it as a unit;
 *  - (member rows lift out of their card the same way — see `DraggableMemberRow`.)
 *
 * Norman's mapping rule shapes the feedback: a gap opening between entries always means
 * "drop between", the ring always means "drop into", and the two are never shown at once.
 *
 * Built on the gesture-handler `Gesture` API + Reanimated shared values (the same primitives
 * the swipe rows use), NOT a drag library, and NOT layout animations (Fabric's view-flattening
 * breaks them here — see FadeInView). The dragged item renders as a non-interactive *ghost*
 * overlaid on the grid while the original hides in place: the ghost escapes every card's
 * `overflow: hidden` and needs no zIndex juggling, and because it lives inside the scroll
 * content it stays glued to the finger even while the list auto-scrolls. No React event ever
 * crosses into a worklet — JS callbacks are invoked via `scheduleOnRN` (react-native-worklets)
 * with primitive arguments only (the worklet-serialization crash that killed the old sortables
 * integration can't happen here). All geometry lives in pure helpers in `lib/drag-order` (jest-covered).
 */

/** The grid's between-card gap — one slot is an entry's height plus this. The grid wrapper
 *  (`DragGrid`) applies it, so the drag math and the layout can never disagree. */
const DRAG_GRID_GAP = Spacing.two;

/** The hairline separator between member rows inside a stack card (matches `RowSeparator`) —
 *  the inter-row gap for an in-card reorder's settle math. */
const MEMBER_GAP = StyleSheet.hairlineWidth;

/** How long a press must hold before the row lifts (matches the old pickup feel). A stack
 *  card holds a touch longer than its member rows, so on a member row the member's own gesture
 *  deterministically wins the race and the card lifts only from its header/edges. */
const LIFT_HOLD_MS = 300;
const CARD_LIFT_HOLD_MS = 350;

/** Auto-scroll engages within this many px of the viewport's top/bottom edge… */
const EDGE_SCROLL_ZONE = 72;
/** …ramping quadratically up to this speed (px/s) at the very edge. */
const EDGE_SCROLL_MAX_V = 900;

/** The pre-lift signifier: partway into a deliberate hold, the pressed entry starts to lift — a
 *  quiet "keep holding, this is picking up" cue that quick taps and swipes never see (Norman: a
 *  hidden gesture needs a signifier the moment the user starts to find it). It's a *shadow bloom*,
 *  not a scale: scaling a card by a hair doesn't re-render it, it bitmap-scales the drawn card, so
 *  the text + hairline border + rounded corners get resampled into a faint grain. A shadow is drawn
 *  apart from the content, so the card stays crisp — and it previews the drag ghost's own lift. A
 *  member row (a bare row on a stack card, no surface to float) can't cast a clean shadow, so it
 *  uses a faint dim instead — same intent, no resample. */
const PRE_LIFT_DELAY_MS = 150;
/** The pre-lift shadow at full bloom — gentler than the ghost's lift (the card hasn't left yet). */
const PRE_LIFT_SHADOW_OPACITY = 0.16;
const PRE_LIFT_SHADOW_RADIUS = 10;
const PRE_LIFT_SHADOW_LIFT = 5; // shadow y-offset (px): the card's apparent height off the surface
const PRE_LIFT_ELEVATION = 6; // Android's shadow is elevation-driven
/** A member row's grain-free pre-lift instead of the shadow — a barely-there dim as the hold arms. */
const PRE_LIFT_DIM = 0.06;

type DragState = {
  /** The key being dragged (`habit:x` / `stack:x` / `member:x`), or null at rest. */
  draggingKey: SharedValue<string | null>;
  dragKind: SharedValue<DragKind>;
  /** The dragged entry's top-level index; -1 for member drags (insertion-only mode). */
  dragIndex: SharedValue<number>;
  /** Compact insertion index of the open gap; sentinel (= dragIndex, or -1) = gaps closed. */
  insertIndex: SharedValue<number>;
  hoveredStackId: SharedValue<string | null>;
  /** A dragged member's parent stack id (its own card body means "cancel", not "join"). */
  ownStackId: SharedValue<string | null>;
  /** Dragged entry height + grid gap — how far entries shift to open a gap. */
  slotSize: SharedValue<number>;
  /** Set the moment a drop commits (or the cancel spring starts): the drag is settling, so
   *  `onFinalize` must not double-cancel and the frame callback must stop steering the ghost. */
  committed: SharedValue<boolean>;
  // The ghost (grid coordinates: relative to DragGrid's top-left).
  ghostY: SharedValue<number>;
  ghostH: SharedValue<number>;
  ghostLift: SharedValue<number>; // 0 rest → 1 lifted (scale + shadow)
  ghostOpacity: SharedValue<number>;
  ghostMounted: SharedValue<boolean>;
  // Grab bookkeeping.
  grabY: SharedValue<number>;
  lastTranslationY: SharedValue<number>;
  /** The finger's window-relative Y (RNGH `absoluteY`). Window-relative is transform-immune, so
   *  the frame callback derives the viewport-relative position from the current `viewportTop` each
   *  frame — the edge-scroll zone can't go stale while the iOS large title collapses mid-drag. */
  pointerAbsoluteY: SharedValue<number>;
  scrollAtGrab: SharedValue<number>;
  viewportTop: SharedValue<number>;
  viewportH: SharedValue<number>;
  gridTop: SharedValue<number>;
  gridH: SharedValue<number>;
  minOffset: SharedValue<number>;
  // Layout registry (written from JS onLayout; read in worklets).
  frames: SharedValue<Record<string, Frame>>;
  order: SharedValue<OrderMeta[]>;
  // In-card member reorder: a member dragged within its own stack reorders the siblings.
  memberFrames: SharedValue<Record<string, Frame>>; // member row grid frames, keyed member:<id>
  memberOrder: SharedValue<Record<string, string[]>>; // stackId → member keys in sequence
  /** JS-side registry of each member row's re-measurer, so a lift can refresh every member
   *  frame at once (their own onLayout misses card-level shifts — see MemberRowDrag). */
  memberMeasurers: Map<string, () => void>;
  /** Re-run every registered member measurer (called via scheduleOnRN at member-drag start). */
  remeasureMembers: () => void;
  reorderStackId: SharedValue<string | null>; // the card being reordered (null = not reordering)
  memberDragIndex: SharedValue<number>; // dragged member's index within its card
  memberInsertIndex: SharedValue<number>; // live target compact index within the card
  // Scroll plumbing.
  scrollOffset: SharedValue<number>;
  scrollRef: AnimatedRef<Animated.ScrollView>;
  reduceMotion: boolean;
  // JS boundary — called via scheduleOnRN with primitive args only.
  onDragActive: (key: string | null) => void;
  finishBetween: (draggedKey: string, beforeKey: string) => void;
  finishInto: (draggedKey: string, stackId: string) => void;
  finishReorder: (draggedKey: string, stackId: string, index: number) => void;
  hoverTick: () => void;
};

const HabitDragContext = createContext<DragState | null>(null);

function useDrag(): DragState {
  const ctx = use(HabitDragContext);
  if (!ctx) throw new Error('Habit drag components must be used within a HabitDragProvider');
  return ctx;
}

/**
 * Owns the drag's shared state and the commit protocol; wrap the whole grid in one provider.
 * `order` mirrors the rendered entries (keys in render order); a change to it mid-drag means
 * the data moved under the finger (focus refresh, day rollover) — the drag aborts cleanly.
 */
export function HabitDragProvider({
  scrollRef,
  order: orderProp,
  memberOrder: memberOrderProp,
  contentBottomInset = 0,
  onDragActive,
  onDropBetween,
  onDropInto,
  onDropReorder,
  children,
}: {
  scrollRef: AnimatedRef<Animated.ScrollView>;
  order: OrderMeta[];
  /** stackId → its member keys (`member:<id>`) in sequence — the inner lists a member reorders
   *  within (mirrors `order` for the top level). */
  memberOrder: Record<string, string[]>;
  /** The scroll content's padding below the grid — bounds how far auto-scroll may go. */
  contentBottomInset?: number;
  /** Ghost mount/unmount + scroll freeze: called with the lifted key, then null at rest. */
  onDragActive: (key: string | null) => void;
  /** Commit a between-drop: move `draggedKey` before `beforeKey` (`''` = end of list). */
  onDropBetween: (draggedKey: string, beforeKey: string) => void;
  /** Commit an into-drop: `draggedKey` joins stack `stackId`. */
  onDropInto: (draggedKey: string, stackId: string) => void;
  /** Commit an in-card reorder: move member `draggedKey` to compact `index` within `stackId`. */
  onDropReorder: (draggedKey: string, stackId: string, index: number) => void;
  children: ReactNode;
}) {
  const draggingKey = useSharedValue<string | null>(null);
  const dragKind = useSharedValue<DragKind>('stack');
  const dragIndex = useSharedValue(0);
  const insertIndex = useSharedValue(0);
  const hoveredStackId = useSharedValue<string | null>(null);
  const ownStackId = useSharedValue<string | null>(null);
  const slotSize = useSharedValue(0);
  const committed = useSharedValue(false);
  const ghostY = useSharedValue(0);
  const ghostH = useSharedValue(0);
  const ghostLift = useSharedValue(0);
  const ghostOpacity = useSharedValue(1);
  const ghostMounted = useSharedValue(false);
  const grabY = useSharedValue(0);
  const lastTranslationY = useSharedValue(0);
  const pointerAbsoluteY = useSharedValue(0);
  const scrollAtGrab = useSharedValue(0);
  const viewportTop = useSharedValue(0);
  const viewportH = useSharedValue(0);
  const gridTop = useSharedValue(0);
  const gridH = useSharedValue(0);
  const minOffset = useSharedValue(0);
  const frames = useSharedValue<Record<string, Frame>>({});
  const order = useSharedValue<OrderMeta[]>([]);
  const memberFrames = useSharedValue<Record<string, Frame>>({});
  const memberOrder = useSharedValue<Record<string, string[]>>({});
  const reorderStackId = useSharedValue<string | null>(null);
  const memberDragIndex = useSharedValue(-1);
  const memberInsertIndex = useSharedValue(-1);
  const scrollOffset = useScrollOffset(scrollRef);
  const reduceMotion = useReducedMotion();

  // Member rows re-register their measurer every render; a member drag's start sweeps the whole
  // registry so every member frame is fresh in grid coordinates. A member's own onLayout only
  // fires when its layout changes RELATIVE TO ITS CARD — when the card itself shifts in the grid
  // (an entry above reordered, deleted, or auto-collapsed on completion), the stored grid Ys
  // drift silently and an in-card reorder would resolve against rows that are no longer there.
  const [memberMeasurers] = useState(() => new Map<string, () => void>());
  const remeasureMembers = () => {
    for (const fn of memberMeasurers.values()) fn();
  };

  /** A light tick as the open gap moves or a card starts/stops glowing — drag feedback. */
  const hoverTick = () => haptics.selection();

  /** Register where the finger's drop would land right now: the ring and the gap are mutually
   *  exclusive readings (one visible meaning at a time), each change ticking a light haptic. */
  const applySlot = (slot: DropSlot) => {
    'worklet';
    const closed = dragKind.get() === 'member' ? -1 : dragIndex.get(); // sentinel: gaps shut
    // A member over its own card: reorder inside it. The top-level gaps stay shut and no ring
    // shows (the meaning is "move within", not "join"); the card's member rows part instead.
    if (slot.kind === 'reorder') {
      if (reorderStackId.get() !== slot.stackId) reorderStackId.set(slot.stackId);
      if (hoveredStackId.get() !== null) hoveredStackId.set(null);
      insertIndex.set(closed);
      if (memberInsertIndex.get() !== slot.index) {
        memberInsertIndex.set(slot.index);
        scheduleOnRN(hoverTick);
      }
      return;
    }
    if (reorderStackId.get() !== null) reorderStackId.set(null); // left the own card
    if (slot.kind === 'into') {
      if (hoveredStackId.get() !== slot.stackId) {
        hoveredStackId.set(slot.stackId);
        scheduleOnRN(hoverTick);
      }
      insertIndex.set(closed);
      return;
    }
    if (hoveredStackId.get() !== null) hoveredStackId.set(null);
    // An act has nowhere to go between cards — a habit lives in a stack or nowhere at all — so a
    // member drag never opens a top-level gap. Norman's mapping rule, kept honest: a gap that
    // opened here would promise a drop that can't commit.
    const next = slot.kind === 'between' && dragKind.get() !== 'member' ? slot.index : closed;
    if (insertIndex.get() !== next) {
      insertIndex.set(next);
      scheduleOnRN(hoverTick);
    }
  };

  // The drag's heartbeat: while a drag is live (and not yet settling), every frame follows the
  // finger in content coordinates, auto-scrolls near the viewport edges (a stationary finger
  // keeps scrolling — the ghost stays glued to it by construction), and re-resolves the drop
  // slot. Gesture callbacks only *record* the finger; all steering happens here.
  const frame = useFrameCallback((info) => {
    if (draggingKey.get() === null || committed.get()) return;
    const sv = measure(scrollRef);
    if (sv) {
      viewportTop.set(sv.pageY); // the iOS large title collapses — the viewport's top moves
      viewportH.set(sv.height);
    }
    const dt = Math.min(64, info.timeSincePreviousFrame ?? 16) / 1000;
    // Derive the finger's viewport-relative Y from the viewport top measured THIS frame — so the
    // edge-scroll zone stays correct even while the finger is still and the iOS large title
    // collapses under an auto-scroll. `absoluteY` is window-relative (RNGH recommends the absolute
    // coords for a view the gesture transforms); `measure().pageY` is the scrollview's window Y, so
    // the difference is the finger within the viewport — recomputed here, never a stale snapshot.
    const pointerY = pointerAbsoluteY.get() - viewportTop.get();
    const v = edgeScrollVelocity(pointerY, viewportH.get(), EDGE_SCROLL_ZONE, EDGE_SCROLL_MAX_V);
    if (v !== 0) {
      const maxOffset = Math.max(
        minOffset.get(),
        gridTop.get() + gridH.get() + contentBottomInset - viewportH.get(),
      );
      const next = Math.min(maxOffset, Math.max(minOffset.get(), scrollOffset.get() + v * dt));
      if (next !== scrollOffset.get()) scrollTo(scrollRef, 0, next, false);
    }
    const top = grabY.get() + lastTranslationY.get() + (scrollOffset.get() - scrollAtGrab.get());
    ghostY.set(top);
    // The gap holds where it is unless the ghost's centre clears a boundary by SLOT_HYSTERESIS.
    // Both "current" readings fall back to the slot the drag STARTED in rather than -1, because the
    // opening frame sits exactly on a boundary (the lifted entry's centre is the compacted midpoint
    // of the one below it) — with no bias to hold, that first coin flip is what shoved the row below
    // up behind the card the moment it was picked up.
    const curReorder = memberInsertIndex.get() >= 0 ? memberInsertIndex.get() : memberDragIndex.get();
    const slot = resolveDropSlot(
      top + ghostH.get() / 2,
      order.get(),
      frames.get(),
      draggingKey.get()!,
      dragKind.get(),
      ownStackId.get(),
      memberOrder.get(),
      memberFrames.get(),
      insertIndex.get(),
      curReorder,
      SLOT_HYSTERESIS,
    );
    applySlot(slot);
  }, false);

  /** Single gate for drag start/stop on the JS side: runs the screen's callback and toggles
   *  the frame callback with it. Starting is refused when the drag it announces has already
   *  been aborted (a mid-drag data change can null `draggingKey` on the JS thread while the
   *  gesture's own start callback is still in flight — without the guard the ghost would
   *  mount with no live gesture left to ever dismiss it). */
  const setDragActive = (key: string | null) => {
    if (key !== null && draggingKey.get() !== key) return;
    frame.setActive(key !== null);
    onDragActive(key);
  };

  /** True between asking for a drop's mutation and seeing the order change it produces — the one
   *  order change this provider must NOT read as "the ground moved under a live drag". */
  const awaitingCommit = useRef(false);

  // Commit handlers run the whole protocol in ONE JS task: the data mutation (optimistic
  // setState) and the shared-value reset land in the same React batch, so the re-rendered
  // order and the cleared translateY/opacity hit the screen on the same frame — no flash.
  // Each verifies it is committing the drag that is still live: a settle animation that gets
  // cancelled and replayed later (its completion re-fires with finished=false) must not
  // re-commit a drag that already ended. The drop haptic fires here — these run from the
  // settle spring's (or the melt's) completion, so the touch-down is felt on the very frame
  // the ghost visually lands. The pickup buzzed the lift; this answers it. A cancelled drag
  // never reaches these handlers, so "never mind" stays silent.
  // Tear the drag down ONE FRAME after the mutation, never in the same breath as it.
  //
  // The claim above — that the mutation and the reset "land in the same React batch" — was only
  // half true: `onDrop*` sets React state, but a shared-value write is not part of any React batch.
  // It reaches the UI thread on the very next frame, while the new order has to travel a render and
  // a Fabric mount to get there. Clearing `draggingKey` inline therefore zeroed the displaced rows'
  // translateY while they were still laid out in the OLD order: each one dropped a full slot for a
  // frame or two and sprang back as the new layout arrived. That round trip is the flick seen on
  // the row a card was dropped past — the position is right at both ends, so it reads as the text
  // stuttering rather than the row moving.
  //
  // A frame's delay lets the commit land first, so every frame shows a self-consistent pair (old
  // layout + displacement, then new layout + none). rAF always fires, so a drop that changes no
  // order at all — a stale anchor `onDropBetween` declines to act on — still ends its drag.
  const clearAfterCommit = () => {
    // Claim the order change this mutation is about to produce, so the signature effect below can
    // tell "the order moved because I just committed" from "the ground moved under a live drag".
    // Without it that effect tears the drag down as a passive effect — same tick as the render, and
    // so still ahead of the mount reaching the UI thread. That was the sliver of flicker left after
    // deferring this teardown: two resets, and the earlier one still won.
    awaitingCommit.current = true;
    requestAnimationFrame(() => {
      awaitingCommit.current = false; // a drop that changed no order must not swallow the next one
      draggingKey.set(null);
      hoveredStackId.set(null);
      reorderStackId.set(null);
      memberInsertIndex.set(-1);
      frame.setActive(false);
      onDragActive(null);
    });
  };
  const finishBetween = (draggedKey: string, beforeKey: string) => {
    if (draggingKey.get() !== draggedKey) return;
    haptics.drop();
    onDropBetween(draggedKey, beforeKey);
    clearAfterCommit();
  };
  const finishInto = (draggedKey: string, stackId: string) => {
    if (draggingKey.get() !== draggedKey) return;
    haptics.drop();
    onDropInto(draggedKey, stackId);
    clearAfterCommit();
  };
  // A member reorder settled inside its own card: commit the new member index (same protocol as
  // finishInto — this runs from the settle spring's finished=true completion, so the drop is felt
  // on the frame the ghost lands, and a cancelled-and-replayed settle can't re-commit).
  const finishReorder = (draggedKey: string, stackId: string, index: number) => {
    if (draggingKey.get() !== draggedKey) return;
    haptics.drop();
    onDropReorder(draggedKey, stackId, index);
    clearAfterCommit();
  };
  // Mirror the rendered entry order (top-level and per-card members) into the worklet-readable
  // registries; if either changes while a drag is live, the ground truth moved under the finger —
  // abort rather than commit stale. Member order changes on its own for an in-card reorder commit
  // (top-level order is untouched), so the member signature is a distinct trigger.
  const orderSignature = orderProp.map((o) => o.key).join('|');
  const memberSignature = Object.keys(memberOrderProp)
    .map((k) => `${k}:${memberOrderProp[k]!.join(',')}`)
    .join('|');
  useEffect(() => {
    order.set(orderProp);
    memberOrder.set(memberOrderProp);
    if (awaitingCommit.current) {
      // Our own drop landing. `clearAfterCommit`'s frame owns the reset — it is timed to follow the
      // mount, where this effect would precede it and snap the displaced rows back against a layout
      // that has not changed yet.
      awaitingCommit.current = false;
    } else if (draggingKey.get() !== null) {
      committed.set(true); // a trailing onFinalize must not run its cancel spring
      draggingKey.set(null);
      hoveredStackId.set(null);
      reorderStackId.set(null);
      memberInsertIndex.set(-1);
      setDragActive(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the orders' identity
  }, [orderSignature, memberSignature]);

  // (No useMemo — the React Compiler memoizes this value with correct dependencies.)
  const value: DragState = {
    draggingKey, dragKind, dragIndex, insertIndex, hoveredStackId,
    ownStackId, slotSize, committed, ghostY, ghostH, ghostLift, ghostOpacity, ghostMounted,
    grabY, lastTranslationY, pointerAbsoluteY, scrollAtGrab, viewportTop, viewportH, gridTop, gridH,
    minOffset, frames, order, memberFrames, memberOrder, memberMeasurers, remeasureMembers,
    reorderStackId, memberDragIndex, memberInsertIndex, scrollOffset, scrollRef, reduceMotion,
    onDragActive: setDragActive, finishBetween, finishInto, finishReorder, hoverTick,
  };

  return <HabitDragContext value={value}>{children}</HabitDragContext>;
}

/** The grid wrapper the entries (and the ghost) live in — it owns the coordinate space every
 *  frame is measured in, and reports its own place in the scroll content for grab math. */
export function DragGrid({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const { gridTop, gridH } = useDrag();
  const onLayout = (e: LayoutChangeEvent) => {
    gridTop.set(e.nativeEvent.layout.y);
    gridH.set(e.nativeEvent.layout.height);
  };
  return (
    <View style={[styles.grid, style]} onLayout={onLayout}>
      {children}
    </View>
  );
}

/**
 * The parting transform, shared by both lists: entries spring aside to open the gap while a drag
 * is live, and snap back the instant it ends.
 *
 * That reset must be INSTANT. A spring back to 0 animates a stale offset across a layout the commit
 * has already corrected — the row below a dropped item slides a full slot and settles back, with
 * the overshoot on top. The top-level entry always had this guard and the member row didn't, which
 * is precisely why landing glitched inside a stack and never between cards.
 *
 * `active` is what "a drag is live for this list" means: any live drag at top level, this card
 * being the one under reorder for a member row.
 */
function partingTransform(active: boolean, shift: number, reduceMotion: boolean) {
  'worklet';
  return [{ translateY: active ? (reduceMotion ? shift : withSpring(shift, Spring.settle)) : 0 }];
}

/**
 * Wraps a top-level entry (a standalone habit row or a whole stack card): a deliberate hold
 * lifts it, entries around it spring aside to show where it would land, and a stack card
 * glows when a habit would join it. Also draws that glow (the accent ring) on stack entries.
 */
export function DraggableEntry({
  entryKey,
  index,
  kind,
  stackId,
  draggable = true,
  children,
}: {
  entryKey: string;
  index: number;
  kind: EntryKind;
  stackId: string | null;
  /** False disables the lift (the empty "Add your first habit" card: a memberless stack has no
   *  unit in the order math, so every drop of it would silently snap back — don't offer the
   *  gesture). The entry still registers its frame and accepts into-drops. */
  draggable?: boolean;
  children: ReactNode;
}) {
  const {
    draggingKey, dragKind, dragIndex, insertIndex, hoveredStackId,
    ownStackId, slotSize, committed, ghostY, ghostH, ghostLift, ghostOpacity, ghostMounted,
    grabY, lastTranslationY, pointerAbsoluteY, scrollAtGrab, viewportTop, viewportH, gridTop,
    minOffset, frames, order, scrollOffset, scrollRef, reduceMotion, onDragActive, finishBetween,
    finishInto,
  } = useDrag();
  const ref = useAnimatedRef<Animated.View>();
  const preLift = useSharedValue(0);
  const holdMs = kind === 'stack' ? CARD_LIFT_HOLD_MS : LIFT_HOLD_MS;

  // Register this entry's frame (grid coordinates). `e.nativeEvent.layout` is parent-relative in
  // principle, but on this RN/Fabric build a view tracked by `useAnimatedRef` reports layout.x/y
  // as a flat 0 regardless of its real position — every card measured `y: 0`, which silently broke
  // reordering and cross-card drops alike. `onLayout` still fires at the right times, so it's kept
  // as the trigger; the real position comes from `measure()` instead, the same way the member
  // row's `registerFrame` already derives its own grid-relative Y.
  // `.modify` (not read-spread-set): every entry lays out in the same JS tick, and a
  // read-modify-write against the async JS-side copy would drop all but the last entry.
  const onLayout = () => {
    scheduleOnUI(() => {
      'worklet';
      const m = measure(ref);
      const sv = measure(scrollRef);
      if (!m || !sv) return;
      const y = m.pageY - sv.pageY + scrollOffset.get() - gridTop.get();
      frames.modify((f) => {
        'worklet';
        f[entryKey] = { y, h: m.height };
        return f;
      });
    });
  };

  // Hook API (gesture-handler 3): one config object instead of a builder chain, so the gesture
  // is not rebuilt on every render — the shape the React Compiler can reason about. Callback
  // names follow v3: onStart → onActivate, onEnd → onDeactivate, onTouchesCancelled →
  // onTouchesCancel. The worklets babel plugin autoworkletizes this object's callbacks.
  const pan = usePanGesture({
    enabled: draggable,
    activateAfterLongPress: holdMs,
    shouldCancelWhenOutside: false,
    // The pre-lift swell: eased in over the back half of the hold, wiped the instant the
    // touch ends or the gesture loses (a quick tap or a swipe never shows it).
    onTouchesDown: () => {
      if (draggingKey.get() !== null || reduceMotion) return;
      preLift.set(withDelay(PRE_LIFT_DELAY_MS, withTiming(1, { duration: holdMs - PRE_LIFT_DELAY_MS })));
    },
    onTouchesUp: () => preLift.set(withTiming(0, { duration: Duration.fast })),
    onTouchesCancel: () => preLift.set(withTiming(0, { duration: Duration.fast })),
    // The gesture callbacks are UI-thread worklets, not render code — measuring the ref in
    // onActivate is the documented gesture-handler pattern. (Under the v2 builder chain this
    // needed a `react-hooks/refs` disable; the config-object form no longer trips that rule.)
    onActivate: (e) => {
      if (draggingKey.get() !== null) return; // one drag at a time
      const m = measure(ref);
      const sv = measure(scrollRef);
      if (!m || !sv) return;
      viewportTop.set(sv.pageY);
      viewportH.set(sv.height);
      scrollAtGrab.set(scrollOffset.get());
      minOffset.set(Math.min(0, scrollOffset.get())); // iOS large-title negative inset
      const gy = m.pageY - sv.pageY + scrollOffset.get() - gridTop.get();
      grabY.set(gy);
      lastTranslationY.set(0);
      pointerAbsoluteY.set(e.absoluteY);
      ghostY.set(gy);
      ghostH.set(m.height);
      slotSize.set(m.height + DRAG_GRID_GAP);
      dragIndex.set(index);
      insertIndex.set(index); // sentinel: gaps closed, the original slot is the hole
      dragKind.set(kind);
      ownStackId.set(null);
      committed.set(false);
      preLift.set(0); // the ghost's lift takes over from the pre-lift swell
      draggingKey.set(entryKey);
      scheduleOnRN(onDragActive, entryKey);
      scheduleOnRN(haptics.pickup);
    },
    // Only record the finger — the provider's frame callback does all the steering, so the
    // ghost and the drop slot stay live even when the finger rests still while auto-scrolling.
    onUpdate: (e) => {
      if (draggingKey.get() !== entryKey) return;
      lastTranslationY.set(e.translationY);
      pointerAbsoluteY.set(e.absoluteY);
    },
    onDeactivate: () => {
      if (draggingKey.get() !== entryKey) return;
      const hovered = hoveredStackId.get();
      if (hovered !== null) {
        // Join the glowing stack: the ghost melts into the card, then the move commits.
        // Completion callbacks only act when the animation genuinely finished — a cancelled
        // settle re-fires with finished=false and must never (re-)commit.
        committed.set(true);
        ghostLift.set(reduceMotion ? 0 : withTiming(0, { duration: Duration.fast }));
        ghostOpacity.set(
          withTiming(0, { duration: reduceMotion ? 1 : Duration.fast }, (finished) => {
            if (finished === true) scheduleOnRN(finishInto, entryKey, hovered);
          }),
        );
        return;
      }
      const at = insertIndex.get();
      if (at !== dragIndex.get()) {
        // Reorder: settle the ghost into the open gap, THEN commit — the displaced entries
        // already sit in the final layout, so the re-render is pixel-identical.
        committed.set(true);
        const beforeKey = keyAtCompactIndex(order.get(), entryKey, at) ?? '';
        const targetY = slotTopForIndex(order.get(), frames.get(), entryKey, slotSize.get(), at, DRAG_GRID_GAP);
        if (reduceMotion) {
          ghostY.set(targetY);
          scheduleOnRN(finishBetween, entryKey, beforeKey);
        } else {
          ghostLift.set(withSpring(0, Spring.settle));
          ghostY.set(
            withSpring(targetY, Spring.settle, (finished) => {
              if (finished === true) scheduleOnRN(finishBetween, entryKey, beforeKey);
            }),
          );
        }
      }
      // Dropped on its own slot → fall through to the cancel in onFinalize.
    },
    onFinalize: () => {
      if (draggingKey.get() !== entryKey || committed.get()) return;
      // Cancel: close the gaps and float home (nothing changed — Nielsen's easy way out).
      committed.set(true); // settling now — the frame callback must let the spring fly home
      hoveredStackId.set(null);
      insertIndex.set(dragIndex.get());
      const home = grabY.get() + (scrollOffset.get() - scrollAtGrab.get());
      if (reduceMotion) {
        ghostY.set(home);
        draggingKey.set(null);
        scheduleOnRN(onDragActive, null);
      } else {
        ghostLift.set(withSpring(0, Spring.settle));
        ghostY.set(
          withSpring(home, Spring.settle, (finished) => {
            if (finished !== true || draggingKey.get() !== entryKey) return;
            draggingKey.set(null);
            scheduleOnRN(onDragActive, null);
          }),
        );
      }
    },
  });

  const style = useAnimatedStyle(() => {
    const dk = draggingKey.get();
    const shift = dk === null ? 0 : displacementFor(index, dragIndex.get(), insertIndex.get(), slotSize.get());
    const lift = preLift.get();
    return {
      // The original hides only once the ghost is actually on screen — no handoff flicker.
      opacity: dk === entryKey && ghostMounted.get() ? 0 : 1,
      transform: partingTransform(dk !== null, shift, reduceMotion),
      // The pre-lift cue: a soft shadow blooms so the card floats a touch — grain-free (a shadow is
      // drawn apart from the card's crisp text/edges) and a preview of the ghost's lift shadow.
      shadowOpacity: lift * PRE_LIFT_SHADOW_OPACITY,
      shadowRadius: lift * PRE_LIFT_SHADOW_RADIUS,
      shadowOffset: { width: 0, height: lift * PRE_LIFT_SHADOW_LIFT },
      elevation: lift * PRE_LIFT_ELEVATION,
    };
  });

  return (
    <GestureDetector gesture={pan}>
      {/* Split for the same reason the member row is (see its note): the MEASURED node carries no
          transform, so `measure(ref)` reads this entry's RESTING grid position. The displacement
          rides the inner view. When both lived on one node, a commit landing mid-drag — and one
          always does, since announcing the drag sets React state — re-fired `onLayout` while the
          entry sat displaced, and `measure()` wrote that shifted position into `frames`. The
          midpoints drifted by a slot under the finger, so `insertIndex` flipped back and forth and
          the neighbours jerked. `styles.liftShadow` sets a static shadow colour; the animated style
          blooms its opacity/radius on the pre-lift hold (zero at rest, so nothing shows until). */}
      <Animated.View ref={ref} onLayout={onLayout}>
        <Animated.View style={[styles.liftShadow, style]}>
          {children}
          {stackId !== null ? <DropRing stackId={stackId} /> : null}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * Wraps a member row inside a stack card so it can be lifted OUT: drop it between top-level
 * entries to detach it there, or onto another stack card to move it across. Its own card's
 * body means "never mind" (the ghost floats home). Insertion-only mode: no top-level slot is
 * vacated, so `dragIndex`/`insertIndex` use the `-1` sentinel and entries only ever part to
 * make room. Tolerates a missing provider (a `StackCard` can render outside the Today grid —
 * e.g. as the drag ghost's copy) by rendering its child untouched.
 */
export function DraggableMemberRow(props: {
  habitId: string;
  parentStackId: string;
  /** This member's index within its card's sequence — the anchor for an in-card reorder. */
  memberIndex: number;
  children: ReactNode;
}) {
  const ctx = use(HabitDragContext);
  if (!ctx) return <>{props.children}</>;
  return <MemberRowDrag {...props} />;
}

function MemberRowDrag({
  habitId,
  parentStackId,
  memberIndex,
  children,
}: {
  habitId: string;
  parentStackId: string;
  memberIndex: number;
  children: ReactNode;
}) {
  const {
    draggingKey, dragKind, dragIndex, insertIndex, hoveredStackId, ownStackId, slotSize,
    committed, ghostY, ghostH, ghostLift, ghostOpacity, ghostMounted, grabY, lastTranslationY,
    pointerAbsoluteY, scrollAtGrab, viewportTop, viewportH, gridTop, minOffset,
    memberFrames, memberOrder, memberMeasurers, remeasureMembers, reorderStackId, memberDragIndex,
    memberInsertIndex, scrollOffset, scrollRef, reduceMotion, onDragActive,
    finishInto, finishReorder,
  } = useDrag();
  const ref = useAnimatedRef<Animated.View>();
  const preLift = useSharedValue(0);
  const entryKey = `member:${habitId}`;

  // Register this member row's grid-coordinate frame (measured on the UI thread and converted the
  // same way `onStart` does), so an in-card reorder can resolve where the finger would drop among
  // the siblings. Member rows are nested inside the card, so a plain `onLayout` gives only
  // parent-relative coordinates — a `measure` is the honest read. `.modify` (not read-spread-set):
  // sibling rows lay out in the same tick, and a read-modify-write would drop all but the last.
  const registerFrame = () => {
    scheduleOnUI(() => {
      'worklet';
      const m = measure(ref);
      const sv = measure(scrollRef);
      if (!m || !sv) return;
      const y = m.pageY - sv.pageY + scrollOffset.get() - gridTop.get();
      memberFrames.modify((f) => {
        'worklet';
        f[entryKey] = { y, h: m.height };
        return f;
      });
    });
  };

  // onLayout above only fires when this row moves relative to its CARD — when the card itself
  // shifts in the grid (a stack above auto-collapses, an entry is reordered/removed), the stored
  // grid Y goes stale with no signal here. So every row keeps its measurer registered with the
  // provider, and a member drag's start sweeps them all — frames are fresh by the time any drop
  // could resolve. Re-registered each render (no dep array) so the latest closure is always held.
  useEffect(() => {
    memberMeasurers.set(entryKey, registerFrame);
    return () => {
      if (memberMeasurers.get(entryKey) === registerFrame) memberMeasurers.delete(entryKey);
    };
  });

  // Hook API (gesture-handler 3) — see the note on the top-level entry's pan. The 300ms hold here
  // vs the card's 350ms is still the ONLY thing arbitrating a member row against its parent card;
  // there is no explicit relation between them.
  const pan = usePanGesture({
    activateAfterLongPress: LIFT_HOLD_MS,
    shouldCancelWhenOutside: false,
    onTouchesDown: () => {
      if (draggingKey.get() !== null || reduceMotion) return;
      preLift.set(withDelay(PRE_LIFT_DELAY_MS, withTiming(1, { duration: LIFT_HOLD_MS - PRE_LIFT_DELAY_MS })));
    },
    onTouchesUp: () => preLift.set(withTiming(0, { duration: Duration.fast })),
    onTouchesCancel: () => preLift.set(withTiming(0, { duration: Duration.fast })),
    // The gesture callbacks are UI-thread worklets, not render code — measuring the ref in
    // onActivate is the documented gesture-handler pattern. (Under the v2 builder chain this
    // needed a `react-hooks/refs` disable; the config-object form no longer trips that rule.)
    onActivate: (e) => {
      if (draggingKey.get() !== null) return; // one drag at a time
      const m = measure(ref);
      const sv = measure(scrollRef);
      if (!m || !sv) return;
      viewportTop.set(sv.pageY);
      viewportH.set(sv.height);
      scrollAtGrab.set(scrollOffset.get());
      minOffset.set(Math.min(0, scrollOffset.get()));
      const gy = m.pageY - sv.pageY + scrollOffset.get() - gridTop.get();
      grabY.set(gy);
      lastTranslationY.set(0);
      pointerAbsoluteY.set(e.absoluteY);
      ghostY.set(gy);
      ghostH.set(m.height);
      slotSize.set(m.height + DRAG_GRID_GAP);
      dragIndex.set(-1); // insertion-only: the member vacates no top-level slot
      insertIndex.set(-1);
      dragKind.set('member');
      ownStackId.set(parentStackId);
      reorderStackId.set(null); // resolved per-frame: set only while over the own card
      memberDragIndex.set(memberIndex);
      memberInsertIndex.set(-1);
      committed.set(false);
      preLift.set(0); // the ghost's lift takes over from the pre-lift swell
      draggingKey.set(entryKey);
      // Refresh EVERY member row's grid frame: their onLayout misses card-level shifts (a stack
      // above collapsing, entries reordered), and an in-card reorder resolving against drifted
      // frames commits the wrong index. Lift-to-drop is hundreds of ms — plenty for the sweep.
      scheduleOnRN(remeasureMembers);
      scheduleOnRN(onDragActive, entryKey);
      scheduleOnRN(haptics.pickup);
    },
    onUpdate: (e) => {
      if (draggingKey.get() !== entryKey) return;
      lastTranslationY.set(e.translationY);
      pointerAbsoluteY.set(e.absoluteY);
    },
    onDeactivate: () => {
      if (draggingKey.get() !== entryKey) return;
      const hovered = hoveredStackId.get();
      if (hovered !== null) {
        // Crossed into another stack: melt into its card, then commit the move.
        committed.set(true);
        ghostLift.set(reduceMotion ? 0 : withTiming(0, { duration: Duration.fast }));
        ghostOpacity.set(
          withTiming(0, { duration: reduceMotion ? 1 : Duration.fast }, (finished) => {
            if (finished === true) scheduleOnRN(finishInto, entryKey, hovered);
          }),
        );
        return;
      }
      const reorderStack = reorderStackId.get();
      if (reorderStack !== null) {
        // Reordering within the own card: settle the ghost into the member gap, THEN commit the
        // new index. A drop back on the member's own slot (at === its index) is a no-op — fall
        // through to onFinalize's float-home. `finished === true` guards the re-fire on a
        // cancelled settle (same rule as the top-level reorder).
        const at = memberInsertIndex.get();
        if (at !== memberDragIndex.get()) {
          committed.set(true);
          const keys = memberOrder.get()[reorderStack] ?? [];
          const targetY = slotTopForKeys(keys, memberFrames.get(), entryKey, ghostH.get(), at, MEMBER_GAP);
          if (reduceMotion) {
            ghostY.set(targetY);
            scheduleOnRN(finishReorder, entryKey, reorderStack, at);
          } else {
            ghostLift.set(withSpring(0, Spring.settle));
            ghostY.set(
              withSpring(targetY, Spring.settle, (finished) => {
                if (finished === true) scheduleOnRN(finishReorder, entryKey, reorderStack, at);
              }),
            );
          }
        }
        return; // over the own card → never a detach/between
      }
      // Anywhere else — a gap between cards, empty space — means nothing for an act: it belongs
      // to a stack or to nothing, so there is no "out". onFinalize floats it home.
    },
    onFinalize: () => {
      if (draggingKey.get() !== entryKey || committed.get()) return;
      committed.set(true); // settling — the frame callback must let the spring fly home
      hoveredStackId.set(null);
      insertIndex.set(-1);
      reorderStackId.set(null);
      memberInsertIndex.set(-1);
      const home = grabY.get() + (scrollOffset.get() - scrollAtGrab.get());
      if (reduceMotion) {
        ghostY.set(home);
        draggingKey.set(null);
        scheduleOnRN(onDragActive, null);
      } else {
        ghostLift.set(withSpring(0, Spring.settle));
        ghostY.set(
          withSpring(home, Spring.settle, (finished) => {
            if (finished !== true || draggingKey.get() !== entryKey) return;
            draggingKey.set(null);
            scheduleOnRN(onDragActive, null);
          }),
        );
      }
    },
  });

  const style = useAnimatedStyle(() => {
    // While THIS card is being reordered, member rows part to open the gap at the target index —
    // the same displacement the top-level entries use, scoped to the card's members (the dragged
    // member's own shift is 0, and it's hidden anyway).
    const reordering = reorderStackId.get() === parentStackId;
    const shift = reordering
      ? displacementFor(memberIndex, memberDragIndex.get(), memberInsertIndex.get(), ghostH.get())
      : 0;
    return {
      // The hidden original holds its slot open inside the card — the visible hole is honest
      // feedback about where the member returns if the drag cancels. The pre-lift cue is a faint
      // dim (not a scale): a bare row has no card to float, and scaling its text only grained it.
      opacity: (draggingKey.get() === entryKey && ghostMounted.get() ? 0 : 1) * (1 - preLift.get() * PRE_LIFT_DIM),
      transform: partingTransform(reordering, shift, reduceMotion),
    };
  });

  return (
    <GestureDetector gesture={pan}>
      {/* The MEASURED node (ref + onLayout) carries NO transform, so `measure(ref)` reads the
          member's RESTING grid position. `measure()` returns the on-screen frame with transforms
          applied (reanimated docs), so if the displacement lived here, a reorder's settling
          translateY would pollute `memberFrames` — the in-card reorder would then resolve against
          drifted positions (why it felt more fragile inside a stack than at the top level, where
          frames come from transform-free `onLayout`). The displacement rides the inner view. */}
      <Animated.View ref={ref} onLayout={registerFrame}>
        <Animated.View style={style}>{children}</Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

/** The accent "drop here to join" ring a stack card shows while a habit hovers over it. */
function DropRing({ stackId }: { stackId: string }) {
  const { hoveredStackId } = useDrag();
  const theme = useTheme();
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(hoveredStackId.get() === stackId ? 1 : 0, { duration: Duration.fast }),
  }));
  return <Animated.View pointerEvents="none" style={[styles.dropRing, { borderColor: theme.accent }, style]} />;
}

/**
 * The floating copy of whatever is being dragged, rendered by the screen as the grid's last
 * child while a drag is live. Lives inside the scroll content (grid coordinates), so it tracks
 * the finger correctly by construction even while the list auto-scrolls; `pointerEvents="none"`
 * keeps it out of every hit test. Mounting it is what finally hides the original.
 */
export function DragGhost({ children }: { children: ReactNode }) {
  const { ghostY, ghostLift, ghostOpacity, ghostMounted, reduceMotion } = useDrag();

  useEffect(() => {
    ghostMounted.set(true);
    ghostLift.set(reduceMotion ? 1 : withSpring(1, Spring.settle));
    return () => {
      ghostMounted.set(false);
      ghostLift.set(0);
      ghostOpacity.set(1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only
  }, []);

  const style = useAnimatedStyle(() => {
    const l = ghostLift.get();
    return {
      opacity: ghostOpacity.get(),
      transform: [{ translateY: ghostY.get() }, { scale: 1 + l * 0.03 }],
      shadowOpacity: l * 0.24,
      shadowRadius: l * 12,
      shadowOffset: { width: 0, height: l * 6 },
    };
  });

  return (
    <View pointerEvents="none" style={styles.ghostLayer}>
      <Animated.View style={[styles.ghost, style]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The grid owns its gutters and its `gap` (not per-card margins) so entries are direct
  // children whose measured frames tile the space exactly — the drag math depends on it,
  // and the ghost layer's gutters below must match the padding here.
  grid: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    gap: DRAG_GRID_GAP,
  },
  // Overlays the grid's content box (inside its horizontal padding), so ghost translateY
  // shares the same coordinate space as the entries' measured frames.
  ghostLayer: {
    position: 'absolute',
    top: 0,
    left: Spacing.three,
    right: Spacing.three,
    zIndex: 100,
  },
  ghost: {
    shadowColor: '#000',
    elevation: 8,
  },
  // Static shadow colour for the pre-lift bloom; the animated style supplies the (zero-at-rest)
  // opacity/radius/offset, so an entry casts no shadow until a deliberate hold begins.
  liftShadow: {
    shadowColor: '#000',
  },
  dropRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderRadius: Radius.card,
  },
});
