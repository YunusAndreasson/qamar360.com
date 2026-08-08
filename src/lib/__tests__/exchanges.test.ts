import { describe, expect, it } from '@jest/globals';

import { CURATED_EXCHANGES, EXCHANGE_GROUPS } from '@/constants/exchanges';
import { SUNNAH_PRESETS } from '@/constants/sunnah-habits';
import { exchangeRowContract } from '@/lib/exchange';
import { normalizeName } from '@/lib/names';

describe('the curated exchange library', () => {
  it('has a unique id per entry', () => {
    const ids = CURATED_EXCHANGES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // The name IS the dedupe key — there is no DB constraint, so two entries sharing one would
  // become "X" and "X 2" in a user's list with nothing to tell them apart.
  it('has a unique name per entry, folded the way the app compares them', () => {
    const names = CURATED_EXCHANGES.map((e) => normalizeName(e.name));
    expect(new Set(names).size).toBe(names.length);
  });

  // The regression this file was written for: 'Drank water' was already the `hydrate-water`
  // preset, so adding the exchange on top of the "After waking" stack produced a silent
  // near-duplicate. Exchanges and acts share one namespace and must not collide in it.
  it('never reuses a name the Sunnah catalogue already owns', () => {
    const taken = new Set(SUNNAH_PRESETS.map((p) => normalizeName(p.name)));
    const clashes = CURATED_EXCHANGES.filter((e) => taken.has(normalizeName(e.name))).map((e) => e.name);
    expect(clashes).toEqual([]);
  });

  // The row renders "Instead of {insteadOf} · {cue}", so a capital would land mid-sentence.
  // Proper nouns are the deliberate exception, and there are none in the library today.
  it.each(CURATED_EXCHANGES)('reads mid-sentence in the row: $id', (entry) => {
    expect(entry.insteadOf[0]).toBe(entry.insteadOf[0]?.toLowerCase());
    expect(entry.cue[0]).toBe(entry.cue[0]?.toLowerCase());
  });

  // Every entry has to survive the day-end question "did this happen?". A cue that names no
  // recognisable moment is not an if-then plan, and a deed phrased as an absence is the one
  // framing the evidence says makes the habit stronger.
  it.each(CURATED_EXCHANGES)('names a deed, not an avoidance: $id', (entry) => {
    expect(entry.name).not.toMatch(/avoid|resist|didn't|did not|no more|stopped eating|abstain|quit/i);
    const { label, hint, meta } = exchangeRowContract({
      name: entry.name,
      insteadOf: entry.insteadOf,
      held: false,
      skipped: false,
    });
    for (const text of [label, hint, meta]) expect(text).not.toMatch(/avoid|resist|abstain/i);
  });

  // The day's row is two lines and no more — the deed, then what it stands in for — and each is
  // clamped to a single line. A string that outgrows its line is silently truncated with an
  // ellipsis: invisible in review, obvious only on a phone, and worst on the entry whose whole job
  // is to be read at a glance by someone tired. So the budget is enforced here rather than trusted.
  // The caps are the longest current entry plus a little room, not an aspiration.
  it.each(CURATED_EXCHANGES)('fits the row it is read on: $id', (entry) => {
    expect(entry.name.length).toBeLessThanOrEqual(24);
    const { meta } = exchangeRowContract({
      name: entry.name,
      insteadOf: entry.insteadOf,
      held: false,
      skipped: false,
    });
    expect(meta.length).toBeLessThanOrEqual(34);
  });

  it.each(CURATED_EXCHANGES)('says what counts and where it comes from: $id', (entry) => {
    expect(entry.detail.length).toBeGreaterThan(0);
    expect(entry.evidence.length).toBeGreaterThan(0);
  });

  it('flattens every group, in library order', () => {
    expect(CURATED_EXCHANGES).toEqual(EXCHANGE_GROUPS.flatMap((g) => g.exchanges));
    expect(EXCHANGE_GROUPS.every((g) => g.exchanges.length > 0)).toBe(true);
  });

  it('titles its groups in the uppercase voice the library headers use', () => {
    for (const group of EXCHANGE_GROUPS) expect(group.title).toBe(group.title.toUpperCase());
  });
});
