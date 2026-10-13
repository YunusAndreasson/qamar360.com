import { describe, expect, it } from '@jest/globals';

import {
  buildPaths,
  columnBounds,
  DIRECTION_THRESHOLD,
  lineCrossesRect,
  linearFit,
  mean,
  pointAt,
  polylineLength,
  project,
  slotAtX,
  slotX,
  buildSmoothPaths,
  spanColumns,
  spanFor,
  type PlotBox,
} from '@/lib/chart';

// Expectations are derived from intended behaviour ("a lone point is centred", "a projection can
// never leave the plot"), never copied from output — a red test means the geometry is wrong.

const BOX: PlotBox = { height: 120, padY: 12, padX: 12 };
const WIDTH = 300;

describe('spanFor', () => {
  it('spreads slots evenly from the first to the last', () => {
    expect(spanFor(0, 5)).toBe(0);
    expect(spanFor(2, 5)).toBe(0.5);
    expect(spanFor(4, 5)).toBe(1);
  });

  it('centres a lone slot — pinned to the edge it reads as a chart that failed to draw', () => {
    expect(spanFor(0, 1)).toBe(0.5);
  });
});

describe('pointAt', () => {
  it('places a full reading at the top inset and an empty one on the baseline', () => {
    expect(pointAt(0, 1, WIDTH, BOX).y).toBe(BOX.padY);
    expect(pointAt(0, 0, WIDTH, BOX).y).toBe(BOX.height - BOX.padY);
  });

  it('insets x by the label margin at both ends, so edge labels stay under their dot', () => {
    expect(pointAt(0, 0, WIDTH, BOX).x).toBe(BOX.padX);
    expect(pointAt(1, 0, WIDTH, BOX).x).toBe(WIDTH - BOX.padX);
  });

  it('clamps a reading outside 0–1 rather than drawing outside the plot', () => {
    expect(pointAt(0.5, 1.4, WIDTH, BOX).y).toBe(BOX.padY);
    expect(pointAt(0.5, -0.3, WIDTH, BOX).y).toBe(BOX.height - BOX.padY);
  });

  // `padBottom` exists so a chart that draws nothing under its baseline can stop reserving room
  // there (OverTime). It must move the baseline WITHOUT squeezing the plot: shortening the box by
  // exactly what comes off the bottom inset has to leave every reading at the y it already had.
  it('takes a separate bottom inset, keeping the top inset for headroom', () => {
    const cropped: PlotBox = { height: 108, padY: 12, padBottom: 0, padX: 12 };
    expect(pointAt(0, 1, WIDTH, cropped).y).toBe(cropped.padY);
    expect(pointAt(0, 0, WIDTH, cropped).y).toBe(cropped.height);
    // Same plot area as the symmetric BOX above (96pt), so a mid reading lands identically.
    expect(pointAt(0, 0.5, WIDTH, cropped).y).toBe(pointAt(0, 0.5, WIDTH, BOX).y);
  });

  it('falls back to padY when no bottom inset is given', () => {
    const { padBottom, ...symmetric } = { ...BOX, padBottom: 3 };
    expect(padBottom).toBe(3); // the spread above really did drop it
    expect(pointAt(0, 0, WIDTH, symmetric).y).toBe(BOX.height - BOX.padY);
  });
});

describe('polylineLength', () => {
  it('sums the segments — the draw-on budget must be the real length', () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 14 }])).toBe(15);
  });

  it('is zero for fewer than two points', () => {
    expect(polylineLength([])).toBe(0);
    expect(polylineLength([{ x: 5, y: 5 }])).toBe(0);
  });
});

describe('buildPaths', () => {
  it('draws nothing below two points — a one-point area is a hairline artefact, not a chart', () => {
    expect(buildPaths([{ x: 1, y: 2 }], 100)).toEqual({ line: '', area: '' });
    expect(buildPaths([], 100)).toEqual({ line: '', area: '' });
  });

  it('closes the area down to the baseline at both ends of the line', () => {
    const { line, area } = buildPaths([{ x: 0, y: 10 }, { x: 20, y: 30 }], 100);
    expect(line).toBe('M 0 10 L 20 30');
    expect(area).toBe('M 0 100 L 0 10 L 20 30 L 20 100 Z');
  });
});

describe('buildSmoothPaths', () => {
  /** Every coordinate the path visits — anchors and Bézier controls alike. A control point outside
   *  the data's range is exactly how a spline bulges past it. */
  const ys = (d: string): number[] =>
    (d.match(/-?\d+(\.\d+)?\s+-?\d+(\.\d+)?/g) ?? []).map((pair) => Number(pair.split(/\s+/)[1]));

  it('draws nothing below two points', () => {
    expect(buildSmoothPaths([{ x: 1, y: 2 }], 100)).toEqual({ line: '', area: '' });
    expect(buildSmoothPaths([], 100)).toEqual({ line: '', area: '' });
  });

  it('is a curve, not a polyline', () => {
    const { line } = buildSmoothPaths([{ x: 0, y: 50 }, { x: 10, y: 20 }, { x: 20, y: 40 }], 100);
    expect(line).toContain('C');
    expect(line).not.toContain('L');
  });

  it('passes through every point it was given', () => {
    const pts = [{ x: 0, y: 50 }, { x: 10, y: 20 }, { x: 20, y: 40 }];
    const { line } = buildSmoothPaths(pts, 100);
    for (const p of pts) expect(line).toContain(`${p.x} ${p.y}`);
  });

  // The guarantee that makes this monotone cubic rather than Catmull-Rom. A peak here is a period
  // fully kept; an overshoot would draw the curve above a complete orbit — a rate the app defines
  // as impossible — and would do it right where the eye is drawn.
  it('never overshoots a peak', () => {
    // A spike: flat, up hard, flat again. A cardinal spline bulges above the peak on both sides.
    const pts = [{ x: 0, y: 90 }, { x: 10, y: 90 }, { x: 20, y: 10 }, { x: 30, y: 90 }, { x: 40, y: 90 }];
    const { line } = buildSmoothPaths(pts, 100);
    // y is inverted in screen space, so the peak is the MINIMUM y.
    expect(Math.min(...ys(line))).toBeGreaterThanOrEqual(10);
    expect(Math.max(...ys(line))).toBeLessThanOrEqual(90);
  });

  it('never dips below a trough at the end of a fall', () => {
    const pts = [{ x: 0, y: 10 }, { x: 10, y: 20 }, { x: 20, y: 80 }, { x: 30, y: 90 }];
    expect(Math.max(...ys(buildSmoothPaths(pts, 100).line))).toBeLessThanOrEqual(90);
  });

  it('keeps a flat run flat — no arcing off a plateau and back', () => {
    const pts = [{ x: 0, y: 40 }, { x: 10, y: 40 }, { x: 20, y: 40 }];
    expect(new Set(ys(buildSmoothPaths(pts, 100).line))).toEqual(new Set([40]));
  });

  it('closes the area down to the baseline at both ends', () => {
    const { area } = buildSmoothPaths([{ x: 5, y: 10 }, { x: 25, y: 30 }], 100);
    expect(area.startsWith('M 5 100 L 5 10')).toBe(true);
    expect(area.endsWith('L 25 100 Z')).toBe(true);
  });
});

// A scrub that computes its position independently of the curve is a scrub that can disagree with
// it — the cursor lands between points, or reports a slot it isn't over. These pin the two together.
describe('slotX / slotAtX', () => {
  it('places a slot exactly where the curve draws it', () => {
    for (let i = 0; i < 9; i++) {
      expect(slotX(i, 9, WIDTH, BOX)).toBeCloseTo(pointAt(spanFor(i, 9), 0, WIDTH, BOX).x, 10);
    }
  });

  it('round-trips: the x of a slot reads back as that slot', () => {
    for (const total of [2, 3, 9, 47, 80]) {
      for (let i = 0; i < total; i++) {
        expect(slotAtX(slotX(i, total, WIDTH, BOX), total, WIDTH, BOX)).toBe(i);
      }
    }
  });

  it('snaps to the nearest slot from anywhere between two', () => {
    const total = 5;
    const a = slotX(1, total, WIDTH, BOX);
    const b = slotX(2, total, WIDTH, BOX);
    expect(slotAtX(a + (b - a) * 0.2, total, WIDTH, BOX)).toBe(1);
    expect(slotAtX(a + (b - a) * 0.8, total, WIDTH, BOX)).toBe(2);
  });

  it('clamps outside the plot rather than running off the series', () => {
    expect(slotAtX(-500, 6, WIDTH, BOX)).toBe(0);
    expect(slotAtX(WIDTH + 500, 6, WIDTH, BOX)).toBe(5);
  });

  it('survives a plot with no width yet, and a series of one', () => {
    expect(slotAtX(120, 6, 0, BOX)).toBe(0);
    expect(slotAtX(120, 1, WIDTH, BOX)).toBe(0);
  });
});

describe('columnBounds', () => {
  it('tiles the plot edge to edge, with no gaps and no overlap', () => {
    const count = 6;
    const cols = Array.from({ length: count }, (_, i) => columnBounds(i, count, WIDTH, BOX));
    expect(cols[0]!.left).toBe(0);
    expect(cols[count - 1]!.left + cols[count - 1]!.width).toBe(WIDTH);
    for (let i = 1; i < count; i++) {
      expect(cols[i]!.left).toBeCloseTo(cols[i - 1]!.left + cols[i - 1]!.width, 10);
    }
  });

  it('centres each interior column on its own point, not on an equal slice of the width', () => {
    const count = 6;
    const { left, width } = columnBounds(3, count, WIDTH, BOX);
    expect(left + width / 2).toBeCloseTo(pointAt(spanFor(3, count), 0, WIDTH, BOX).x, 10);
  });
});


describe('mean', () => {
  it('says nothing below two points — a rule through your only reading describes nothing', () => {
    expect(mean([])).toBeNull();
    expect(mean([0.5])).toBeNull();
  });

  it('averages what it is given', () => {
    expect(mean([0.2, 0.4])).toBeCloseTo(0.3, 10);
    expect(mean([0, 0.5, 1])).toBeCloseTo(0.5, 10);
  });

  it('is the plain average, not a trailing or weighted one — the reference is the whole period', () => {
    // A run that ends high: a recency-weighted average would sit above 0.5, and the rule would
    // then be measuring the readings against themselves rather than against the period.
    expect(mean([0, 0, 1, 1])).toBeCloseTo(0.5, 10);
  });

  it('holds at the ends of the scale, where a full period and an empty one both live', () => {
    expect(mean([1, 1, 1])).toBeCloseTo(1, 10);
    expect(mean([0, 0, 0])).toBeCloseTo(0, 10);
  });
});

describe('linearFit', () => {
  it('has no direction below two points — the whole failure mode a projection must avoid', () => {
    expect(linearFit([])).toBeNull();
    expect(linearFit([0.5])).toBeNull();
  });

  it('recovers the slope and intercept of a straight run', () => {
    const fit = linearFit([0.1, 0.2, 0.3, 0.4])!;
    expect(fit.slope).toBeCloseTo(0.1, 10);
    expect(fit.intercept).toBeCloseTo(0.1, 10);
  });

  it('reads a flat run as flat, and a falling one as negative', () => {
    expect(linearFit([0.5, 0.5, 0.5])!.slope).toBeCloseTo(0, 10);
    expect(linearFit([0.9, 0.6, 0.3])!.slope).toBeCloseTo(-0.3, 10);
  });
});

describe('project', () => {
  const opts = { horizon: 7, fitWindow: 14 };

  it('projects nothing from a single point', () => {
    expect(project([0.5], opts)).toBeNull();
    expect(project([], opts)).toBeNull();
  });

  it('carries a rising run forward one step at a time', () => {
    const p = project([0.1, 0.2, 0.3], { horizon: 2, fitWindow: 14 })!;
    expect(p.values[0]).toBeCloseTo(0.4, 10);
    expect(p.values[1]).toBeCloseTo(0.5, 10);
  });

  it('emits exactly `horizon` values', () => {
    expect(project([0.4, 0.5], opts)!.values).toHaveLength(7);
  });

  it('never leaves the plot — an extrapolation is a straight line, and a promise it cannot keep', () => {
    const rising = project([0.5, 0.9], opts)!; // slope 0.4/step would pass 1 within two steps
    expect(Math.max(...rising.values)).toBeLessThanOrEqual(1);
    const falling = project([0.5, 0.1], opts)!;
    expect(Math.min(...falling.values)).toBeGreaterThanOrEqual(0);
  });

  it('fits the tail only, so an old rhythm cannot hold the direction back', () => {
    // Long flat history, then a clear recent climb: fitting everything would read as barely moving.
    const values = [...Array<number>(20).fill(0.2), 0.4, 0.6, 0.8];
    expect(project(values, { horizon: 1, fitWindow: 3 })!.direction).toBe('Rising');
    expect(project(values, { horizon: 1, fitWindow: 23 })!.weeklySlope).toBeLessThan(
      project(values, { horizon: 1, fitWindow: 3 })!.weeklySlope,
    );
  });

  describe('the direction word', () => {
    /** A run whose per-step slope is exactly `weekly / 7`. */
    const runAt = (weekly: number) => [0.5, 0.5 + weekly / 7, 0.5 + (2 * weekly) / 7];

    it('names a rise only past the noise threshold', () => {
      expect(project(runAt(DIRECTION_THRESHOLD * 2), { horizon: 1, fitWindow: 14 })!.direction).toBe('Rising');
      expect(project(runAt(DIRECTION_THRESHOLD / 2), { horizon: 1, fitWindow: 14 })!.direction).toBe('Steady');
    });

    it('names an easing only past the same threshold, symmetrically', () => {
      expect(project(runAt(-DIRECTION_THRESHOLD * 2), { horizon: 1, fitWindow: 14 })!.direction).toBe('Easing');
      expect(project(runAt(-DIRECTION_THRESHOLD / 2), { horizon: 1, fitWindow: 14 })!.direction).toBe('Steady');
    });

    it('calls a flat run steady', () => {
      expect(project([0.6, 0.6, 0.6], { horizon: 1, fitWindow: 14 })!.direction).toBe('Steady');
    });
  });
});

describe('spanColumns', () => {
  const BOX = { height: 100, padY: 10, padX: 10 };

  it('runs each column to the midpoint between its neighbours', () => {
    const cols = spanColumns([0, 0.5, 1], 210, BOX);
    // Points at x = 10, 105, 200. Midpoints at 57.5 and 152.5; the ends reach the card edges.
    expect(cols[0]).toEqual({ left: 0, width: 57.5 });
    expect(cols[1]).toEqual({ left: 57.5, width: 95 });
    expect(cols[2]).toEqual({ left: 152.5, width: 57.5 });
  });

  // The whole reason it exists: readings clustered in time must not hand their taps away.
  it('gives a clustered pair narrow columns rather than equal ones', () => {
    const cols = spanColumns([0, 0.9, 1], 210, BOX);
    expect(cols[1]!.width).toBeLessThan(cols[0]!.width);
  });

  it('covers the full width with no gaps between columns', () => {
    const cols = spanColumns([0, 0.25, 0.8, 1], 300, BOX);
    expect(cols[0]!.left).toBe(0);
    for (let i = 1; i < cols.length; i += 1) {
      expect(cols[i]!.left).toBeCloseTo(cols[i - 1]!.left + cols[i - 1]!.width, 6);
    }
    const last = cols[cols.length - 1]!;
    expect(last.left + last.width).toBe(300);
  });

  it('gives a lone point the whole width', () => {
    expect(spanColumns([0.5], 210, BOX)).toEqual([{ left: 0, width: 210 }]);
  });
});

describe('lineCrossesRect', () => {
  const rect = { left: 10, right: 30, top: 40, bottom: 60 };

  it('sees a chord that passes through the rectangle between two points outside it', () => {
    expect(lineCrossesRect([{ x: 0, y: 50 }, { x: 100, y: 50 }], rect)).toBe(true);
  });

  it('sees a steep chord that only clips a corner of it', () => {
    // Falls from above the rectangle to below it inside its width.
    expect(lineCrossesRect([{ x: 5, y: 0 }, { x: 35, y: 100 }], rect)).toBe(true);
  });

  it('ignores a line that runs under it, however long', () => {
    expect(lineCrossesRect([{ x: 0, y: 90 }, { x: 50, y: 90 }, { x: 100, y: 90 }], rect)).toBe(false);
  });

  it('ignores a line that is over the rectangle only outside its width', () => {
    // In the rectangle's band at x = 0 and falling away: by x = 10 it is already below.
    expect(lineCrossesRect([{ x: 0, y: 50 }, { x: 8, y: 95 }, { x: 100, y: 95 }], rect)).toBe(false);
  });

  it('counts a lone point only when it sits inside', () => {
    expect(lineCrossesRect([{ x: 20, y: 50 }], rect)).toBe(true);
    expect(lineCrossesRect([{ x: 20, y: 90 }], rect)).toBe(false);
  });

  it('says no for an empty line', () => {
    expect(lineCrossesRect([], rect)).toBe(false);
  });
});

