/**
 * Drag-to-organise — pure interaction math for the Today list's unified drag.
 *
 * One long-press drag vocabulary: lift a standalone habit, a routine card, or a member row;
 * gaps open between top-level entries to mean "drop between" (reorder / move out), a routine
 * card's inner body lights up to mean "drop into" (join that routine). These helpers do all
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

/** What a top-level entry is: a lone habit row, or a routine (stack) card. */
export type EntryKind = 'habit' | 'stack';

/** What is being dragged: a top-level entry, or a member row inside a routine card. */
export type DragKind = 'habit' | 'stack' | 'member';

/** A top-level entry in render order. `key` is `habit:<id>` / `stack:<id>`. */
export type OrderMeta = { key: string; kind: EntryKind; stackId: string | null };

/** An entry's measured frame, relative to the grid container: top edge and height. */
export type Frame = { y: number; h: number };

/** Where a drop would land right now. */
export type DropSlot =
  | { kind: 'between'; index: number } // compact-space insertion index at top level
  | { kind: 'into'; stackId: string } // join this routine (appended)
  | { kind: 'none' }; // no meaning here (e.g. a member over its own card) → cancel

/** A routine card's "into" zone is its frame inset top and bottom by 20% of its height
 *  (clamped 12–32 px); the bands outside the inset mean "between", so a drop just above or
 *  below a card reorders rather than joins — the two meanings never overlap. */
const INTO_INSET_MIN = 12;
const INTO_INSET_MAX = 32;

function intoInset(height: number): number {
  'worklet';
  return Math.min(INTO_INSET_MAX, Math.max(INTO_INSET_MIN, 0.2 * height));
}

/**
 * Midpoints of the entries that remain once `draggedKey` is lifted out, in compact space —
 * the static thresholds for {@link insertionIndexFor}. Entries after the dragged one sit one
 * `slotSize` higher (its slot has closed). When `draggedKey` is not a top-level entry (a member
 * drag, or null), nothing is removed and the midpoints are simply the measured ones.
 */
export function compactMidpoints(
  order: OrderMeta[],
  frames: Record<string, Frame>,
  draggedKey: string | null,
  slotSize: number,
): number[] {
  'worklet';
  const midpoints: number[] = [];
  let passedDragged = false;
  for (const entry of order) {
    if (entry.key === draggedKey) {
      passedDragged = true;
      continue;
    }
    const f = frames[entry.key];
    if (!f) continue; // not yet measured — skip rather than mis-place
    const top = passedDragged ? f.y - slotSize : f.y;
    midpoints.push(top + f.h / 2);
  }
  return midpoints;
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
 * card agree exactly in the state where the ring shows. A routine card itself can only be
 * reordered (never nested), and a member over its own card's body is a cancel (`none`) — its
 * top/bottom bands still fall through to "between", so a member can be dropped directly above
 * or below its own routine.
 */
export function resolveDropSlot(
  centerY: number,
  order: OrderMeta[],
  frames: Record<string, Frame>,
  draggedKey: string,
  draggedKind: DragKind,
  ownStackId: string | null,
  slotSize: number,
): DropSlot {
  'worklet';
  if (draggedKind !== 'stack') {
    for (const entry of order) {
      if (entry.kind !== 'stack' || entry.key === draggedKey || !entry.stackId) continue;
      const f = frames[entry.key];
      if (!f) continue;
      const inset = intoInset(f.h);
      const top = f.y + inset;
      const bottom = f.y + f.h - inset;
      if (top >= bottom || centerY < top || centerY > bottom) continue;
      if (draggedKind === 'member' && entry.stackId === ownStackId) return { kind: 'none' };
      return { kind: 'into', stackId: entry.stackId };
    }
  }
  const midpoints = compactMidpoints(order, frames, draggedKey, slotSize);
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

/** Where the gap at compact `insertIndex` begins (grid coordinates) — the ghost's settle
 *  target for a between-drop. Past the last entry it is one gap below the compact list. */
export function slotTopForIndex(
  order: OrderMeta[],
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
  for (const entry of order) {
    if (entry.key === draggedKey) {
      passedDragged = true;
      continue;
    }
    const f = frames[entry.key];
    if (!f) continue;
    const top = passedDragged ? f.y - slotSize : f.y;
    if (compact === insertIndex) return top;
    end = top + f.h + gap;
    compact++;
  }
  return end;
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
  | { type: 'member-index'; index: number } // at this index within the target routine
  | { type: 'member-append' } // last in the target routine
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
 * routine's members; a standalone habit restores to just before the unit that follows it.
 * (If the move is about to empty the habit's routine, the caller must instead recreate the
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
 * The full habit order + membership after moving one habit into a routine (`toStackId`) or out
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
  } else if (placement.type === 'after-unit') {
    const i = remaining.findIndex((u) => u.key === placement.key);
    if (i !== -1) at = i + 1;
    else if (droppedUnit?.key === placement.key) at = Math.min(droppedUnit.index, remaining.length);
  }
  remaining.splice(at, 0, unit);
  return { orderedIds: flattenUnits(remaining) };
}
