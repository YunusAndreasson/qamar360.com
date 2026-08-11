import { describe, expect, it } from '@jest/globals';

import {
  buildUnits,
  compactMidpoints,
  compactMidpointsForKeys,
  displacementFor,
  edgeScrollVelocity,
  flattenUnits,
  fullMemberIndexForVisibleDrop,
  insertionIndexFor,
  keyAtCompactIndex,
  moveUnit,
  orderAfterHabitMove,
  placementToRestore,
  resolvableAnchor,
  resolveDropSlot,
  slotTopForIndex,
  slotTopForKeys,
  type Frame,
  type HabitLite,
  type OrderMeta,
} from '@/lib/drag-order';

const GAP = 8;
const ROW = 56; // one act row inside a card
const CARD = 180; // a stack card
const SHORT_CARD = 56; // a one-act card — short, but still a card
const MEMBER_SEP = 1; // the hairline between act rows inside a card (a clean number for the math)

/** A five-card day list — mixed heights, gap-spaced from y=0. Every top-level entry is a stack:
 *  a habit never lives outside one. */
function fixture() {
  const order: OrderMeta[] = [
    { key: 'stack:A', kind: 'stack', stackId: 'A' },
    { key: 'stack:S', kind: 'stack', stackId: 'S' },
    { key: 'stack:B', kind: 'stack', stackId: 'B' },
    { key: 'stack:T', kind: 'stack', stackId: 'T' },
    { key: 'stack:C', kind: 'stack', stackId: 'C' },
  ];
  const heights = [SHORT_CARD, CARD, SHORT_CARD, CARD, SHORT_CARD];
  const frames: Record<string, Frame> = {};
  let y = 0;
  order.forEach((entry, i) => {
    frames[entry.key] = { y, h: heights[i]! };
    y += heights[i]! + GAP;
  });
  return { order, frames };
}

describe('insertionIndexFor', () => {
  const midpoints = [28, 100, 200];

  it('returns 0 above the first midpoint and length past the last', () => {
    expect(insertionIndexFor(0, midpoints)).toBe(0);
    expect(insertionIndexFor(500, midpoints)).toBe(3);
  });

  it('returns the slot between the midpoints it falls among', () => {
    expect(insertionIndexFor(50, midpoints)).toBe(1);
    expect(insertionIndexFor(150, midpoints)).toBe(2);
  });

  it('treats an exact midpoint as past it (stable, no flicker at the threshold)', () => {
    expect(insertionIndexFor(100, midpoints)).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(insertionIndexFor(123, [])).toBe(0);
  });
});

describe('compactMidpoints', () => {
  const { order, frames } = fixture();

  // Fixture tops: a=0, S=64, b=252, T=316, c=504 (each previous top + height + gap).
  it('with no dragged entry (member drag) midpoints are the measured ones', () => {
    const mids = compactMidpoints(order, frames, 'member:x', ROW + GAP);
    expect(mids).toEqual([28, 64 + 90, 252 + 28, 316 + 90, 504 + 28]);
  });

  it('lifts the dragged entry out and shifts later entries up one slot', () => {
    const slot = ROW + GAP;
    const mids = compactMidpoints(order, frames, 'stack:A', slot);
    // stack:S moves from y=64 to y=0, and so on down the list.
    expect(mids).toEqual([64 - slot + 90, 252 - slot + 28, 316 - slot + 90, 504 - slot + 28]);
    expect(mids).toHaveLength(order.length - 1);
  });

  it('skips entries without a measured frame', () => {
    const partial = { ...frames };
    delete partial['stack:B'];
    expect(compactMidpoints(order, partial, null, 0)).toHaveLength(order.length - 1);
  });
});

describe('resolveDropSlot', () => {
  const { order, frames } = fixture();
  const slot = ROW + GAP;
  // stack:S spans y=64..244; its into-inset is clamp(0.2*180)=32 → body 96..212.
  const cardBodyY = 150;
  const cardTopBandY = 70;
  // stack:S's two member rows, measured inside its body — used only by the own-card reorder branch.
  const sMemberOrder = { S: ['member:m1', 'member:m2'] };
  const sMemberFrames: Record<string, Frame> = { 'member:m1': { y: 100, h: 50 }, 'member:m2': { y: 150, h: 50 } };
  const NO_MEMBERS: Record<string, string[]> = {};

  it('a stack card never drops into another stack', () => {
    const result = resolveDropSlot(cardBodyY, order, frames, 'stack:T', 'stack', 'T', CARD + GAP, NO_MEMBERS, {}, 0);
    expect(result.kind).toBe('between');
  });

  it("a member over its own card's body reorders within it (compact member index)", () => {
    // Drag m1 to y=150 (m2's row). Compact midpoints of {m2} = [150 - 56 + 25] = [119]; 150 ≥ 119 → 1.
    expect(resolveDropSlot(cardBodyY, order, frames, 'member:m1', 'member', 'S', slot, sMemberOrder, sMemberFrames, ROW)).toEqual({
      kind: 'reorder',
      stackId: 'S',
      index: 1,
    });
  });

  it("a member over another card's body joins that stack", () => {
    // stack:T spans y=316..496; body 348..464.
    expect(resolveDropSlot(400, order, frames, 'member:m', 'member', 'S', slot, sMemberOrder, sMemberFrames, ROW)).toEqual({
      kind: 'into',
      stackId: 'T',
    });
  });

  it("an act over its own card's top band resolves to between — which commits nothing", () => {
    // An act has nowhere to go outside a stack, so the gesture layer floats it home rather than
    // detaching. resolveDropSlot still reports the geometry; the meaning is applied above it.
    const result = resolveDropSlot(cardTopBandY, order, frames, 'member:m1', 'member', 'S', slot, sMemberOrder, sMemberFrames, ROW);
    expect(result.kind).toBe('between');
  });

  it('a very short card has no into zone (inset floor leaves no body)', () => {
    const tinyOrder: OrderMeta[] = [{ key: 'stack:S', kind: 'stack', stackId: 'S' }];
    const tinyFrames = { 'stack:S': { y: 0, h: 20 } }; // inset 12 each side → body empty
    const result = resolveDropSlot(10, tinyOrder, tinyFrames, 'member:m1', 'member', 'X', slot, NO_MEMBERS, {}, 0);
    expect(result.kind).toBe('between');
  });

  it("a between index matches the plain compact insertion index", () => {
    const bandY = 258; // stack:B's top band
    const result = resolveDropSlot(bandY, order, frames, 'stack:A', 'stack', 'A', SHORT_CARD + GAP, NO_MEMBERS, {}, 0);
    const mids = compactMidpoints(order, frames, 'stack:A', SHORT_CARD + GAP);
    expect(result).toEqual({ kind: 'between', index: insertionIndexFor(bandY, mids) });
  });
});

describe('in-card member reorder', () => {
  // One stack card (into-body y=32..168), three 50px member rows measured inside it.
  const order: OrderMeta[] = [{ key: 'stack:S', kind: 'stack', stackId: 'S' }];
  const frames: Record<string, Frame> = { 'stack:S': { y: 0, h: 200 } };
  const memberOrder = { S: ['member:m1', 'member:m2', 'member:m3'] };
  const memberFrames: Record<string, Frame> = {
    'member:m1': { y: 40, h: 50 },
    'member:m2': { y: 90, h: 50 },
    'member:m3': { y: 140, h: 50 },
  };
  const SLOT = 50;
  const at = (centerY: number, dragged: string) =>
    resolveDropSlot(centerY, order, frames, dragged, 'member', 'S', 0, memberOrder, memberFrames, SLOT);

  it('resolves a compact member index from the finger position', () => {
    // Drag m2 (middle). Compact midpoints of {m1, m3} = [65, 115].
    expect(at(50, 'member:m2')).toEqual({ kind: 'reorder', stackId: 'S', index: 0 }); // to the top
    expect(at(100, 'member:m2')).toEqual({ kind: 'reorder', stackId: 'S', index: 1 }); // stays put
    expect(at(160, 'member:m2')).toEqual({ kind: 'reorder', stackId: 'S', index: 2 }); // to the end
  });

  it('reads real member heights (a tall 2-line member shifts the thresholds)', () => {
    // m1 is a tall 2-line row (h=90) → its midpoint sits lower. Dragging m3, compact {m1, m2}:
    // m1 mid = 20 + 45 = 65; m2 mid = 90 + 25 = 115.
    const tall = { ...memberFrames, 'member:m1': { y: 20, h: 90 } };
    const atTall = (cy: number) =>
      resolveDropSlot(cy, order, frames, 'member:m3', 'member', 'S', 0, memberOrder, tall, SLOT);
    expect(atTall(60)).toEqual({ kind: 'reorder', stackId: 'S', index: 0 });
    expect(atTall(100)).toEqual({ kind: 'reorder', stackId: 'S', index: 1 });
  });

  it('compactMidpointsForKeys lifts the dragged member out and compacts the rest', () => {
    // Drag m1 out: m2, m3 shift up one SLOT. Tops 90→40, 140→90; mids 65, 115.
    expect(compactMidpointsForKeys(memberOrder.S, memberFrames, 'member:m1', SLOT)).toEqual([65, 115]);
  });

  it('slotTopForKeys gives the ghost settle target for a member gap', () => {
    // Drag m1 out (m2,m3 compact up one SLOT); the gap at compact index 1 opens at m3-compacted top.
    expect(slotTopForKeys(memberOrder.S, memberFrames, 'member:m1', SLOT, 1, MEMBER_SEP)).toBe(140 - SLOT);
    // Past the end sits one separator below the last compacted row.
    expect(slotTopForKeys(memberOrder.S, memberFrames, 'member:m1', SLOT, 2, MEMBER_SEP)).toBe(140 - SLOT + 50 + MEMBER_SEP);
  });
});

describe('fullMemberIndexForVisibleDrop', () => {
  // The gesture resolves a compact drop index among the VISIBLE members (dragged one removed);
  // this maps it to a member-index over the FULL list so day-hidden members keep their order.
  it('with no hidden members the visible drop is the full index', () => {
    // Full/visible = [m1, m2, m3]; drag m2. The index is over the dragged-removed list [m1, m3]
    // (as `orderAfterHabitMove`'s member-index inserts), so "before m3" is index 1, not 2.
    expect(fullMemberIndexForVisibleDrop(['m1', 'm2', 'm3'], ['m1', 'm2', 'm3'], 'm2', 0)).toBe(0); // before m1
    expect(fullMemberIndexForVisibleDrop(['m1', 'm2', 'm3'], ['m1', 'm2', 'm3'], 'm2', 1)).toBe(1); // before m3
  });

  it('a drop past the last visible member appends to the full list', () => {
    expect(fullMemberIndexForVisibleDrop(['m1', 'm2', 'm3'], ['m1', 'm2', 'm3'], 'm2', 2)).toBe(2);
  });

  it('a leading hidden member shifts the anchor down in the full list', () => {
    // Full [m1(hidden), m2, m3]; visible [m2, m3]. Drag m2 → rest full {m1, m3}.
    // Drop before visible m3 → anchor m3 sits at full index 1.
    expect(fullMemberIndexForVisibleDrop(['m2', 'm3'], ['m1', 'm2', 'm3'], 'm2', 0)).toBe(1);
    // Drop past the end → append after m1, m3 → index 2.
    expect(fullMemberIndexForVisibleDrop(['m2', 'm3'], ['m1', 'm2', 'm3'], 'm2', 1)).toBe(2);
  });

  it('a hidden member between two visible ones keeps its slot when reordering around it', () => {
    // Full [m2, m1(hidden), m3]; visible [m2, m3]. Drag m3 → rest full {m2, m1}.
    // Drop before visible m2 → anchor m2 at full index 0.
    expect(fullMemberIndexForVisibleDrop(['m2', 'm3'], ['m2', 'm1', 'm3'], 'm3', 0)).toBe(0);
    // Drop past the end → append after m2, m1 → index 2.
    expect(fullMemberIndexForVisibleDrop(['m2', 'm3'], ['m2', 'm1', 'm3'], 'm3', 1)).toBe(2);
  });

  it('an empty visible list (all hidden) appends', () => {
    expect(fullMemberIndexForVisibleDrop([], ['m1', 'm2'], 'x', 0)).toBe(2);
  });
});

describe('displacementFor', () => {
  const SLOT = 64;

  it('the dragged entry itself never displaces', () => {
    expect(displacementFor(2, 2, 0, SLOT)).toBe(0);
  });

  it('sentinel insertIndex = dragIndex closes every gap', () => {
    for (let i = 0; i < 5; i++) expect(displacementFor(i, 2, 2, SLOT)).toBe(0);
  });

  it('dragging down: entries between old and new slot shift up', () => {
    // Entry 0 dragged to insertion index 2: entries 1,2 (compact 0,1) shift up; 3,4 stay.
    expect(displacementFor(1, 0, 2, SLOT)).toBe(-SLOT);
    expect(displacementFor(2, 0, 2, SLOT)).toBe(-SLOT);
    expect(displacementFor(3, 0, 2, SLOT)).toBe(0);
    expect(displacementFor(4, 0, 2, SLOT)).toBe(0);
  });

  it('dragging up: entries between new and old slot shift down', () => {
    // Entry 4 dragged to insertion index 1: entries 1,2,3 (compact 1,2,3) shift down; 0 stays.
    expect(displacementFor(0, 4, 1, SLOT)).toBe(0);
    expect(displacementFor(1, 4, 1, SLOT)).toBe(SLOT);
    expect(displacementFor(2, 4, 1, SLOT)).toBe(SLOT);
    expect(displacementFor(3, 4, 1, SLOT)).toBe(SLOT);
  });

  it('insertion-only mode (member drag): everything at/after the slot shifts down', () => {
    expect(displacementFor(0, -1, 1, SLOT)).toBe(0);
    expect(displacementFor(1, -1, 1, SLOT)).toBe(SLOT);
    expect(displacementFor(4, -1, 1, SLOT)).toBe(SLOT);
  });

  it('insertion-only sentinel -1 closes every gap', () => {
    for (let i = 0; i < 5; i++) expect(displacementFor(i, -1, -1, SLOT)).toBe(0);
  });
});

describe('keyAtCompactIndex / slotTopForIndex', () => {
  const { order, frames } = fixture();
  const slot = ROW + GAP;

  it('maps compact indices to the remaining keys in order', () => {
    expect(keyAtCompactIndex(order, 'stack:A', 0)).toBe('stack:S');
    expect(keyAtCompactIndex(order, 'stack:A', 3)).toBe('stack:C');
    expect(keyAtCompactIndex(order, 'stack:A', 4)).toBeNull();
    expect(keyAtCompactIndex(order, null, 0)).toBe('stack:A');
  });

  it('slot top is the compact top of the entry at that index', () => {
    // Lifting stack:A out: stack:S compacts to y=0.
    expect(slotTopForIndex(order, frames, 'stack:A', slot, 0, GAP)).toBe(0);
    // stack:B compacts from 252 to 252-64=188.
    expect(slotTopForIndex(order, frames, 'stack:A', slot, 1, GAP)).toBe(188);
  });

  it('past the last entry the slot sits one gap below the compact list', () => {
    // stack:C compact top = 504-64=440; bottom + gap = 440+56+8 = 504.
    expect(slotTopForIndex(order, frames, 'stack:A', slot, 4, GAP)).toBe(504);
  });

  it('member drags (nothing lifted out) use measured tops directly', () => {
    expect(slotTopForIndex(order, frames, 'member:m', slot, 2, GAP)).toBe(252);
    expect(slotTopForIndex(order, frames, 'member:m', slot, 5, GAP)).toBe(504 + ROW + GAP);
  });
});

describe('edgeScrollVelocity', () => {
  it('is zero through the middle of the viewport', () => {
    expect(edgeScrollVelocity(400, 800, 72, 900)).toBe(0);
    expect(edgeScrollVelocity(72, 800, 72, 900)).toBe(0);
    expect(edgeScrollVelocity(800 - 72, 800, 72, 900)).toBe(0);
  });

  it('reaches ±maxV at the very edges and is symmetric', () => {
    expect(edgeScrollVelocity(0, 800, 72, 900)).toBe(-900);
    expect(edgeScrollVelocity(800, 800, 72, 900)).toBe(900);
    expect(edgeScrollVelocity(36, 800, 72, 900)).toBe(-edgeScrollVelocity(800 - 36, 800, 72, 900));
  });

  it('ramps quadratically (gentle near the zone edge, fast at the rim)', () => {
    const mild = Math.abs(edgeScrollVelocity(54, 800, 72, 900)); // 25% into the zone
    const strong = Math.abs(edgeScrollVelocity(18, 800, 72, 900)); // 75% into the zone
    expect(mild).toBeCloseTo(900 * 0.0625);
    expect(strong).toBeCloseTo(900 * 0.5625);
  });

  it('clamps beyond the viewport (overscrolled finger)', () => {
    expect(edgeScrollVelocity(-40, 800, 72, 900)).toBe(-900);
    expect(edgeScrollVelocity(840, 800, 72, 900)).toBe(900);
  });
});

// --- ordering ---------------------------------------------------------------

/** Habits: a, then stack S = [s1, s2], then b, then stack T = [t1], then c. */
function habitsFixture(): HabitLite[] {
  return [
    { id: 'a', position: 0, stack_id: null },
    { id: 's1', position: 1, stack_id: 'S' },
    { id: 's2', position: 2, stack_id: 'S' },
    { id: 'b', position: 3, stack_id: null },
    { id: 't1', position: 4, stack_id: 'T' },
    { id: 'c', position: 5, stack_id: null },
  ];
}

describe('buildUnits / flattenUnits', () => {
  it('folds habits into ordered units with stack members contiguous', () => {
    const units = buildUnits(habitsFixture());
    expect(units.map((u) => u.key)).toEqual(['habit:a', 'stack:S', 'habit:b', 'stack:T', 'habit:c']);
    expect(units[1]!.habitIds).toEqual(['s1', 's2']);
  });

  it('anchors a stack at its earliest member and keeps strays in position order', () => {
    // s2 has drifted after b — the invariant should prevent this, but the fold tolerates it.
    const drifted: HabitLite[] = [
      { id: 's1', position: 0, stack_id: 'S' },
      { id: 'b', position: 1, stack_id: null },
      { id: 's2', position: 2, stack_id: 'S' },
    ];
    const units = buildUnits(drifted);
    expect(units.map((u) => u.key)).toEqual(['stack:S', 'habit:b']);
    expect(flattenUnits(units)).toEqual(['s1', 's2', 'b']);
  });

  it('tolerates position gaps (order, not values, is what matters)', () => {
    const gappy: HabitLite[] = [
      { id: 'x', position: 10, stack_id: null },
      { id: 'y', position: 3, stack_id: null },
    ];
    expect(flattenUnits(buildUnits(gappy))).toEqual(['y', 'x']);
  });
});

describe('moveUnit', () => {
  const units = buildUnits(habitsFixture());

  it('moves a unit before another (members travel with their card)', () => {
    const next = moveUnit(units, 'stack:S', 'habit:c');
    expect(flattenUnits(next)).toEqual(['a', 'b', 't1', 's1', 's2', 'c']);
  });

  it('moves a unit to the end with a null anchor', () => {
    const next = moveUnit(units, 'habit:a', null);
    expect(flattenUnits(next)).toEqual(['s1', 's2', 'b', 't1', 'c', 'a']);
  });

  it('is a no-op for unknown keys or self-anchors (stale mid-drag data)', () => {
    expect(moveUnit(units, 'habit:zz', 'habit:a')).toBe(units);
    expect(moveUnit(units, 'habit:a', 'habit:zz')).toBe(units);
    expect(moveUnit(units, 'habit:a', 'habit:a')).toBe(units);
  });
});

describe('resolvableAnchor', () => {
  // The rendered order carries a memberless stack ("Add your first act") that buildUnits never
  // sees — it has no habit rows, so no unit of its own.
  const order: OrderMeta[] = [
    { key: 'habit:a', kind: 'stack', stackId: null },
    { key: 'stack:S', kind: 'stack', stackId: 'S' },
    { key: 'stack:EMPTY', kind: 'stack', stackId: 'EMPTY' },
    { key: 'habit:c', kind: 'stack', stackId: null },
  ];
  const units = buildUnits(habitsFixture());

  it('passes through a null anchor (end of list) and a real anchor unchanged', () => {
    expect(resolvableAnchor(order, units, null)).toBeNull();
    expect(resolvableAnchor(order, units, 'stack:S')).toBe('stack:S');
  });

  it('walks forward past a memberless stack to the next real unit', () => {
    // Dropping "before" the empty stack means before whatever real unit follows it.
    expect(resolvableAnchor(order, units, 'stack:EMPTY')).toBe('habit:c');
  });

  it('resolves to the end when nothing with a unit follows the empty stack', () => {
    const trailing: OrderMeta[] = [...order.slice(0, 3)]; // ends right after stack:EMPTY
    expect(resolvableAnchor(trailing, units, 'stack:EMPTY')).toBeNull();
  });

  it('leaves a truly unknown anchor for moveUnit to reject', () => {
    expect(resolvableAnchor(order, units, 'stack:ghost')).toBe('stack:ghost');
  });
});

describe('orderAfterHabitMove', () => {
  it('into a stack, appended', () => {
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 'a', 'S', { type: 'member-append' });
    expect(orderedIds).toEqual(['s1', 's2', 'a', 'b', 't1', 'c']);
  });

  it('into a stack at a member index (the Undo restore path)', () => {
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 'a', 'S', {
      type: 'member-index',
      index: 1,
    });
    expect(orderedIds).toEqual(['s1', 'a', 's2', 'b', 't1', 'c']);
  });

  it('reorders within the same stack via member-index', () => {
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 's2', 'S', {
      type: 'member-index',
      index: 0,
    });
    expect(orderedIds).toEqual(['a', 's2', 's1', 'b', 't1', 'c']);
  });

  it('out to the top level, before a unit', () => {
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 's1', null, {
      type: 'before-unit',
      key: 'habit:c',
    });
    expect(orderedIds).toEqual(['a', 's2', 'b', 't1', 's1', 'c']);
  });

  it('out to the top level, before a unit hidden between visible ones', () => {
    // Anchoring on stack:T works no matter what the day filter shows around it.
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 'a', null, {
      type: 'after-unit',
      key: 'stack:T',
    });
    expect(orderedIds).toEqual(['s1', 's2', 'b', 't1', 'a', 'c']);
  });

  it('"Remove" default: lands right after its former card', () => {
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 's1', null, {
      type: 'after-unit',
      key: 'stack:S',
    });
    expect(orderedIds).toEqual(['a', 's2', 's1', 'b', 't1', 'c']);
  });

  it('last member out lands at the emptied card\'s former slot', () => {
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 't1', null, {
      type: 'after-unit',
      key: 'stack:T',
    });
    expect(orderedIds).toEqual(['a', 's1', 's2', 'b', 't1', 'c']);
  });

  it('last member dropped just above its own card also lands at the emptied slot', () => {
    // The drag's between-drop above the card anchors before-unit on the card itself — a unit
    // that lifting the last member just dissolved. Must land at its slot, not the list end.
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 't1', null, {
      type: 'before-unit',
      key: 'stack:T',
    });
    expect(orderedIds).toEqual(['a', 's1', 's2', 'b', 't1', 'c']);
  });

  it('unknown anchor falls back to the end', () => {
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 'a', null, {
      type: 'before-unit',
      key: 'habit:gone',
    });
    expect(orderedIds).toEqual(['s1', 's2', 'b', 't1', 'c', 'a']);
  });

  it('null anchor means the end', () => {
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 'a', null, {
      type: 'before-unit',
      key: null,
    });
    expect(orderedIds).toEqual(['s1', 's2', 'b', 't1', 'c', 'a']);
  });

  it('unknown habit changes nothing', () => {
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 'nope', 'S', { type: 'member-append' });
    expect(orderedIds).toEqual(['a', 's1', 's2', 'b', 't1', 'c']);
  });

  it('into a stack whose unit vanished lands as its first member at the end', () => {
    const { orderedIds } = orderAfterHabitMove(habitsFixture(), 'a', 'GHOST', { type: 'member-append' });
    expect(orderedIds).toEqual(['s1', 's2', 'b', 't1', 'c', 'a']);
  });
});

describe('placementToRestore', () => {
  it('a member restores to its index among its stack\'s members', () => {
    expect(placementToRestore(habitsFixture(), 's2')).toEqual({
      toStackId: 'S',
      placement: { type: 'member-index', index: 1 },
    });
  });

  it('a standalone habit restores to before the unit that follows it', () => {
    expect(placementToRestore(habitsFixture(), 'b')).toEqual({
      toStackId: null,
      placement: { type: 'before-unit', key: 'stack:T' },
    });
  });

  it('the last habit restores to the end (null anchor)', () => {
    expect(placementToRestore(habitsFixture(), 'c')).toEqual({
      toStackId: null,
      placement: { type: 'before-unit', key: null },
    });
  });

  it('round-trips: a move followed by its captured restore is an identity', () => {
    const habits = habitsFixture();
    const restore = placementToRestore(habits, 'b')!;
    const moved = orderAfterHabitMove(habits, 'b', 'S', { type: 'member-append' });
    const afterMove: HabitLite[] = moved.orderedIds.map((id, position) => {
      const h = habits.find((x) => x.id === id)!;
      return { ...h, position, stack_id: id === 'b' ? 'S' : h.stack_id };
    });
    const back = orderAfterHabitMove(afterMove, 'b', restore.toStackId, restore.placement);
    expect(back.orderedIds).toEqual(habits.map((h) => h.id));
  });

  it('returns null for an unknown habit', () => {
    expect(placementToRestore(habitsFixture(), 'nope')).toBeNull();
  });
});
