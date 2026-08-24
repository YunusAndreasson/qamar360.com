import { describe, expect, it } from '@jest/globals';
import { createElement } from 'react';


import { separatedRows } from '@/lib/separated-rows';

/** A stand-in row. `createElement` rather than JSX: jest here matches `.test.ts`, not `.test.tsx`. */
const row = (key?: string) => createElement('row', key === undefined ? null : { key });

describe('separatedRows', () => {
  it('rules every row but the first — N rows, N-1 rules', () => {
    const rows = separatedRows([row('a'), row('b'), row('c')]);
    expect(rows.map((r) => r.separated)).toEqual([false, true, true]);
  });

  it('leaves a single row unruled', () => {
    expect(separatedRows(row('only')).map((r) => r.separated)).toEqual([false]);
  });

  it('has nothing to rule when there are no rows', () => {
    expect(separatedRows(null)).toEqual([]);
  });

  it('drops null / undefined / false, so `cond && <Row/>` leaves no rule over nothing', () => {
    const rows = separatedRows([row('a'), null, false, undefined, row('b')]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.separated)).toEqual([false, true]);
  });

  // `Children.toArray` keeps these three, so the filter has to be ours. `items.length && <Row/>`
  // on an empty list yields a bare 0 — a row React Native would refuse to render, under a rule.
  it("drops the falsy values `Children.toArray` keeps — 0, '' and NaN", () => {
    const rows = separatedRows([row('a'), 0, '', NaN, row('b')]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.separated)).toEqual([false, true]);
  });

  it('drops a non-empty string too — a bare string is not a row', () => {
    expect(separatedRows([row('a'), 'stray text'])).toHaveLength(1);
  });

  it('drops a leading empty child rather than spending the unruled slot on it', () => {
    expect(separatedRows([null, row('a'), row('b')]).map((r) => r.separated)).toEqual([false, true]);
  });

  it("keeps each child's own key, so a row survives the list being filtered around it", () => {
    const keys = separatedRows([row('alpha'), row('beta')]).map((r) => r.key);
    // `Children.toArray` prefixes the authored key; what matters is that it is derived from it.
    expect(keys).toEqual(['.$alpha', '.$beta']);
  });

  it('keys an inline child by its position, and never by nothing', () => {
    const keys = separatedRows([row(), row()]).map((r) => r.key);
    expect(keys).toEqual(['.0', '.1']);
    expect(new Set(keys).size).toBe(2);
  });
});
