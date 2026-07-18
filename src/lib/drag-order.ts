/**
 * Drag-to-organise — pure interaction math for the Today list's unified drag.
 *
 * One long-press drag vocabulary: lift a standalone habit, a stack card, or a member row;
 * gaps open between top-level entries to mean "drop between" (reorder / move out), a stack
 * card's inner body lights up to mean "drop into" (join that stack). These helpers do all
 * of the geometry and ordering for that gesture as plain functions:
 *
 *  - geometry (worklet-tagged, called per-frame on the UI thread): where would the drop land,
 *    how far must each entry shift to show the gap, how fast should the list auto-scroll;
 *  - ordering (plain JS, called once at commit): rebuild the full habit order after a move.
 *
 * Keeping them pure keeps the gesture worklets tiny (the react-native-sortables release crash
 * came from fat closures crossing the worklet boundary) and makes the math jest-testable —
 * the same split as {@link geometry.ts}.
 *
 * Two coordinate notions matter:
 *  - "original" space: entry frames as measured at drag start (`{ y, h }` relative to the grid).
 *  - "compact" space: the same list with the dragged entry removed and later entries shifted up
 *    by one slot. Insertion indices are compact-space indices — they are stable while the finger
 *    moves (the thresholds never react to the gap they control, so there is no feedback loop).
 * A member row dragged out of its card is not a top-level entry, so for member drags the two
 * spaces coincide and an insertion is purely additive ("insertion-only" mode).
 */

/** What a top-level entry is: a lone habit row, or a stack (stack) card. */
export type EntryKind = 'habit' | 'stack';

/** What is being dragged: a top-level entry, or a member row inside a stack card. */
export type DragKind = 'habit' | 'stack' | 'member';

/** A top-level entry in render order. `key` is `habit:<id>` / `stack:<id>`. */
export type OrderMeta = { key: string; kind: EntryKind; stackId: string | null };

/** An entry's measured frame, relative to the grid container: top edge and height. */
export type Frame = { y: number; h: number };

/** Where a drop would land right now. */
export type DropSlot =
  | { kind: 'between'; index: number } // compact-space insertion index at top level
  | { kind: 'into'; stackId: string } // join this stack (appended)
  | { kind: 'reorder'; stackId: string; index: number } // reorder within own stack (compact member index)
  | { kind: 'merge'; habitId: string; betweenIndex: number } // hover a lone habit → candidate new stack; betweenIndex = the reorder it falls back to before the merge arms
  | { kind: 'none' }; // no meaning here → cancel (float home)

/** A stack card's "into" zone is its frame inset top and bottom by 20% of its height
 *  (clamped 12–32 px); the bands outside the inset mean "between", so a drop just above or
 *  below a card reorders rather than joins — the two meanings never overlap. */
const INTO_INSET_MIN = 12;
const INTO_INSET_MAX = 32;

function intoInset(height: number): number {
  'worklet';
  return Math.min(INTO_INSET_MAX, Math.max(INTO_INSET_MIN, 0.2 * height));
}

/**
 * Midpoints of the entries (by `key`) that remain once `draggedKey` is lifted out, in compact
 * space — the static thresholds for {@link insertionIndexFor}. Entries after the dragged one sit
 * one `slotSize` higher (its slot has closed). When `draggedKey` isn't in `keys` (a member drag
 * over the top-level list, or null), nothing is removed and the midpoints are the measured ones.
 * Keyed rather than `OrderMeta`-based so the same math serves both the top-level entry list and a
 * stack card's inner member list (a member reordering within its own card).
 */
export function compactMidpointsForKeys(
  keys: string[],
  frames: Record<string, Frame>,
  draggedKey: string | null,
  slotSize: number,
): number[] {
  'worklet';
  const midpoints: number[] = [];
  let passedDragged = false;
  for (const key of keys) {
    if (key === draggedKey) {
      passedDragged = true;
      continue;
    }
    const f = frames[key];
    if (!f) continue; // not yet measured — skip rather than mis-place
    const top = passedDragged ? f.y - slotSize : f.y;
    midpoints.push(top + f.h / 2);
  }
  return midpoints;
}

/** {@link compactMidpointsForKeys} over the top-level entry order. */
export function compactMidpoints(
  order: OrderMeta[],
  frames: Record<string, Frame>,
  draggedKey: string | null,
  slotSize: number,
): number[] {
  'worklet';
  return compactMidpointsForKeys(
    order.map((e) => e.key),
    frames,
    draggedKey,
    slotSize,
  );
}

/** The compact-space insertion index for a ghost centred at `centerY`: the count of remaining
 *  entries whose midpoint sits above it (`midpoints.length` = past the end). */
export function insertionIndexFor(centerY: number, midpoints: number[]): number {
  'worklet';
  for (let i = 0; i < midpoints.length; i++) {
    if (centerY < midpoints[i]!) return i;
  }
  return midpoints.length;
}

/**
 * Resolve where the ghost (centred at `centerY`, original/grid coordinates) would drop.
 * "Into" zones are checked first, against original frames: while a card is hovered the gaps
 * are closed, which puts every entry back at its measured position — so the zone and the visual
 * card agree exactly in the state where the ring shows. A stack card itself can only be
 * reordered (never nested). A member over its OWN card's body reorders *within* that card:
 * `memberOrder[ownStackId]` (its members' keys in sequence) + `memberFrames` (their grid frames)
 * resolve a compact insertion index among the siblings, compacted by `memberSlot` (the dragged
 * member's own height). Its top/bottom bands still fall through to "between", so a member can be
 * dropped directly above or below its own stack to detach there.
 *
 * A lone habit dragged over another lone habit's body resolves to "merge" (fold the two into a new
 * stack) — the same body-inset zone as a card's "into", carrying the `between` index it falls back
 * to so the row stays reorderable until the merge arms (the dwell timer lives in the gesture layer,
 * not here). Only habit-over-habit merges; a member or a card over a lone habit stays "between".
 */
export function resolveDropSlot(
  centerY: number,
  order: OrderMeta[],
  frames: Record<string, Frame>,
  draggedKey: string,
  draggedKind: DragKind,
  ownStackId: string | null,
  slotSize: number,
  memberOrder: Record<string, string[]>,
  memberFrames: Record<string, Frame>,
  memberSlot: number,
): DropSlot {
  'worklet';
  // Computed once and shared: the merge candidate's fallback reorder index must equal the plain
  // `between` index, so a lone habit stays reorderable right up until the merge arms.
  const midpoints = compactMidpoints(order, frames, draggedKey, slotSize);
  if (draggedKind !== 'stack') {
    for (const entry of order) {
      if (entry.key === draggedKey) continue;
      const f = frames[entry.key];
      if (!f) continue;
      const inset = intoInset(f.h);
      const top = f.y + inset;
      const bottom = f.y + f.h - inset;
      if (top >= bottom || centerY < top || centerY > bottom) continue;
      if (entry.kind === 'stack' && entry.stackId) {
        if (draggedKind === 'member' && entry.stackId === ownStackId) {
          const mids = compactMidpointsForKeys(memberOrder[ownStackId] ?? [], memberFrames, draggedKey, memberSlot);
          return { kind: 'reorder', stackId: ownStackId, index: insertionIndexFor(centerY, mids) };
        }
        return { kind: 'into', stackId: entry.stackId };
      }
      // A lone habit's body is a candidate merge target — but only when dragging another lone habit
      // (drop-onto-app-makes-a-folder). A member or a card over it falls through to `between`.
      if (entry.kind === 'habit' && draggedKind === 'habit') {
        return { kind: 'merge', habitId: entry.key.slice('habit:'.length), betweenIndex: insertionIndexFor(centerY, midpoints) };
      }
    }
  }
  return { kind: 'between', index: insertionIndexFor(centerY, midpoints) };
}

/**
 * How far the entry at top-level `index` must shift (translateY) to show the gap at compact
 * insertion index `insertIndex`, given the entry at `dragIndex` is lifted out.
 * `dragIndex = -1` is insertion-only mode (a member drag: no top-level slot was vacated).
 * Sentinels close every gap: entry drags pass `insertIndex = dragIndex`, member drags `-1`.
 */
export function displacementFor(
  index: number,
  dragIndex: number,
  insertIndex: number,
  slotSize: number,
): number {
  'worklet';
  if (dragIndex === index) return 0;
  if (dragIndex < 0) return insertIndex >= 0 && index >= insertIndex ? slotSize : 0;
  const compact = index < dragIndex ? index : index - 1;
  if (index < dragIndex) return compact >= insertIndex ? slotSize : 0;
  return compact >= insertIndex ? 0 : -slotSize;
}

/** The key of the remaining entry at compact `index` once `draggedKey` is lifted out, or null
 *  past the end — the "insert before" anchor a between-drop commits against. */
export function keyAtCompactIndex(
  order: OrderMeta[],
  draggedKey: string | null,
  index: number,
): string | null {
  'worklet';
  let compact = 0;
  for (const entry of order) {
    if (entry.key === draggedKey) continue;
    if (compact === index) return entry.key;
    compact++;
  }
  return null;
}

/**
 * Translate an in-card reorder — resolved among a stack's *visible* members — into a
 * `member-index` placement over its *full* member list, so members hidden by the day filter keep
 * their relative order (the same reason the accessibility reorder works off the unfiltered habits).
 *
 * `visibleIndex` is the compact drop index the gesture resolves: the count of remaining visible
 * members above the ghost, with the dragged member already removed. `visibleMemberIds` and
 * `fullMemberIds` are the visible and full member id lists in order, both *including* the dragged
 * habit (this function drops it). The result is the index of the visible "insert-before" anchor
 * within the full list — or the end of the full list when the drop lands past the last visible
 * member (append). Clamped to ≥ 0 so a not-yet-synced anchor never yields a negative splice index.
 */
export function fullMemberIndexForVisibleDrop(
  visibleMemberIds: string[],
  fullMemberIds: string[],
  draggedId: string,
  visibleIndex: number,
): number {
  const beforeId = visibleMemberIds.filter((id) => id !== draggedId)[visibleIndex];
  const rest = fullMemberIds.filter((id) => id !== draggedId);
  return beforeId === undefined ? rest.length : Math.max(0, rest.indexOf(beforeId));
}

/** Where the gap at compact `insertIndex` begins (grid coordinates) for a list of entries (by
 *  `key`) — the ghost's settle target. Past the last entry it is one `gap` below the compact
 *  list. Keyed so it serves both the top-level list and a card's inner member list (see
 *  {@link slotTopForIndex}). */
export function slotTopForKeys(
  keys: string[],
  frames: Record<string, Frame>,
  draggedKey: string | null,
  slotSize: number,
  insertIndex: number,
  gap: number,
): number {
  'worklet';
  let compact = 0;
  let passedDragged = false;
  let end = 0;
  for (const key of keys) {
    if (key === draggedKey) {
      passedDragged = true;
      continue;
    }
    const f = frames[key];
    if (!f) continue;
    const top = passedDragged ? f.y - slotSize : f.y;
    if (compact === insertIndex) return top;
    end = top + f.h + gap;
    compact++;
  }
  return end;
}

/** {@link slotTopForKeys} over the top-level entry order — the settle target for a between-drop. */
export function slotTopForIndex(
  order: OrderMeta[],
  frames: Record<string, Frame>,
  draggedKey: string | null,
  slotSize: number,
  insertIndex: number,
  gap: number,
): number {
  'worklet';
  return slotTopForKeys(
    order.map((e) => e.key),
    frames,
    draggedKey,
    slotSize,
    insertIndex,
    gap,
  );
}

/** Auto-scroll velocity (px/s) for a pointer at `pointerY` within a viewport of `viewportH`:
 *  zero through the middle, ramping quadratically to ±`maxV` across the top/bottom `zone` px
 *  (negative scrolls up). The ease-in keeps the list still until the finger really commits
 *  to an edge. */
export function edgeScrollVelocity(
  pointerY: number,
  viewportH: number,
  zone: number,
  maxV: number,
): number {
  'worklet';
  if (pointerY < zone) {
    const t = Math.min(1, (zone - pointerY) / zone);
    return -maxV * t * t;
  }
  if (pointerY > viewportH - zone) {
    const t = Math.min(1, (pointerY - (viewportH - zone)) / zone);
    return maxV * t * t;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Ordering (plain JS, commit time)
// ---------------------------------------------------------------------------

/** The slice of a habit the ordering math needs (`Habit` satisfies it structurally). */
export type HabitLite = { id: string; position: number; stack_id: string | null };

/** A top-level unit over ALL habits (not just the viewed day's): a lone habit, or a stack with
 *  every member in position order. `key` matches {@link OrderMeta} keys. */
export type Unit = { key: string; stackId: string | null; habitIds: string[] };

/** Where a moved habit lands (see {@link orderAfterHabitMove}). */
export type MovePlacement =
  | { type: 'member-index'; index: number } // at this index within the target stack
  | { type: 'member-append' } // last in the target stack
  | { type: 'before-unit'; key: string | null } // top level, before this unit (null = end)
  | { type: 'after-unit'; key: string }; // top level, right after this unit

/**
 * Fold ALL habits into ordered top-level units — the unfiltered mirror of the Today screen's
 * `entries` (which only shows the viewed day's habits). Drops resolve against unit *keys*, not
 * visible indices, so habits hidden by the day filter keep a sane relative order. A stack unit
 * sits where its earliest member sits and carries every member; stray non-contiguous members
 * (which the position invariant should prevent) still land in their stack's unit, in order.
 */
export function buildUnits(habits: HabitLite[]): Unit[] {
  const sorted = [...habits].sort((a, b) => a.position - b.position);
  const units: Unit[] = [];
  const stackUnits = new Map<string, Unit>();
  for (const h of sorted) {
    if (!h.stack_id) {
      units.push({ key: `habit:${h.id}`, stackId: null, habitIds: [h.id] });
      continue;
    }
    const existing = stackUnits.get(h.stack_id);
    if (existing) {
      existing.habitIds.push(h.id);
    } else {
      const unit: Unit = { key: `stack:${h.stack_id}`, stackId: h.stack_id, habitIds: [h.id] };
      stackUnits.set(h.stack_id, unit);
      units.push(unit);
    }
  }
  return units;
}

/** Move the unit `unitKey` so it sits before `beforeKey` (null = end of list). Unknown keys —
 *  a stale anchor from a mid-drag data change — leave the order untouched rather than guess. */
export function moveUnit(units: Unit[], unitKey: string, beforeKey: string | null): Unit[] {
  if (unitKey === beforeKey) return units;
  const from = units.findIndex((u) => u.key === unitKey);
  if (from === -1) return units;
  if (beforeKey !== null && !units.some((u) => u.key === beforeKey)) return units;
  const next = [...units];
  const [moved] = next.splice(from, 1);
  if (!moved) return units;
  const at = beforeKey === null ? next.length : next.findIndex((u) => u.key === beforeKey);
  next.splice(at, 0, moved);
  return next;
}

/** Flatten units back into the full ordered habit-id list (`reorderHabits` input). */
export function flattenUnits(units: Unit[]): string[] {
  return units.flatMap((u) => u.habitIds);
}

/**
 * The move that puts `habitId` back exactly where it sits right now — captured BEFORE a move so
 * the confirmation toast's Undo can reverse it. A member restores to its index among its
 * stack's members; a standalone habit restores to just before the unit that follows it.
 * (If the move is about to empty the habit's stack, the caller must instead recreate the
 * deleted stack via `createStack` — a fresh id, since nothing references the old one.)
 */
export function placementToRestore(
  habits: HabitLite[],
  habitId: string,
): { toStackId: string | null; placement: MovePlacement } | null {
  const habit = habits.find((h) => h.id === habitId);
  if (!habit) return null;
  if (habit.stack_id) {
    const index = habits
      .filter((h) => h.stack_id === habit.stack_id)
      .sort((a, b) => a.position - b.position)
      .findIndex((h) => h.id === habitId);
    return { toStackId: habit.stack_id, placement: { type: 'member-index', index } };
  }
  const units = buildUnits(habits);
  const at = units.findIndex((u) => u.key === `habit:${habitId}`);
  const anchor = at === -1 ? null : (units[at + 1]?.key ?? null);
  return { toStackId: null, placement: { type: 'before-unit', key: anchor } };
}

/**
 * The full habit order + membership after moving one habit into a stack (`toStackId`) or out
 * to the top level (`null`), landing per `placement`. Pulls the habit out of its current unit
 * first (dropping that unit if it empties — the caller deletes the actual emptied stack).
 * If `placement` names the just-emptied unit (`after-unit` of the habit's own former stack —
 * the "Remove" default), the habit lands at that unit's former slot: exactly where the card
 * the user just emptied was. Unknown anchors fall back to the end of the list.
 */
export function orderAfterHabitMove(
  habits: HabitLite[],
  habitId: string,
  toStackId: string | null,
  placement: MovePlacement,
): { orderedIds: string[] } {
  const units = buildUnits(habits);
  if (!units.some((u) => u.habitIds.includes(habitId))) {
    return { orderedIds: flattenUnits(units) }; // unknown habit — no change
  }

  // Lift the habit out of its unit; remember where an emptied unit sat.
  let droppedUnit: { key: string; index: number } | null = null;
  const remaining: Unit[] = [];
  for (const [index, unit] of units.entries()) {
    if (!unit.habitIds.includes(habitId)) {
      remaining.push(unit);
      continue;
    }
    const rest = unit.habitIds.filter((id) => id !== habitId);
    if (rest.length > 0) remaining.push({ ...unit, habitIds: rest });
    else droppedUnit = { key: unit.key, index };
  }

  if (toStackId !== null) {
    const target = remaining.find((u) => u.key === `stack:${toStackId}`);
    if (!target) {
      // A memberless stack has no unit; land the habit as that stack's first member, at the end.
      remaining.push({ key: `stack:${toStackId}`, stackId: toStackId, habitIds: [habitId] });
    } else if (placement.type === 'member-index') {
      const at = Math.max(0, Math.min(target.habitIds.length, placement.index));
      target.habitIds = [...target.habitIds.slice(0, at), habitId, ...target.habitIds.slice(at)];
    } else {
      target.habitIds = [...target.habitIds, habitId];
    }
    return { orderedIds: flattenUnits(remaining) };
  }

  const unit: Unit = { key: `habit:${habitId}`, stackId: null, habitIds: [habitId] };
  let at = remaining.length;
  if (placement.type === 'before-unit' && placement.key !== null) {
    const i = remaining.findIndex((u) => u.key === placement.key);
    if (i !== -1) at = i;
    // The anchor can be the habit's OWN just-emptied unit: dragging a stack's last member into
    // the gap just above its own card anchors on that card, which lifting the member dissolved.
    // Land at the dissolved unit's slot (same fallback as after-unit) — without it the habit
    // teleported to the end of the list.
    else if (droppedUnit?.key === placement.key) at = Math.min(droppedUnit.index, remaining.length);
  } else if (placement.type === 'after-unit') {
    const i = remaining.findIndex((u) => u.key === placement.key);
    if (i !== -1) at = i + 1;
    else if (droppedUnit?.key === placement.key) at = Math.min(droppedUnit.index, remaining.length);
  }
  remaining.splice(at, 0, unit);
  return { orderedIds: flattenUnits(remaining) };
}
