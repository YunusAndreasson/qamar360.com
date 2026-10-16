import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { Icons } from '@/constants/icons';
import { MaterialGlyphs } from '@/constants/material-glyphs';

// expo-symbols' own name → codepoint map, read from disk: the package does not export it, and the
// generated subset is only worth anything if it agrees with the font the package ships.
const symbols = JSON.parse(
  readFileSync(join(__dirname, '../../../node_modules/expo-symbols/build/android/symbols.json'), 'utf8'),
) as Record<string, number>;

describe('the Android glyph map', () => {
  it('has a codepoint for every glyph the registry names', () => {
    for (const glyph of Object.values(Icons)) expect(MaterialGlyphs).toHaveProperty(glyph.md);
  });

  it('agrees with expo-symbols, so no glyph draws as the wrong icon after a hand edit', () => {
    for (const [name, codepoint] of Object.entries(MaterialGlyphs)) expect(codepoint).toBe(symbols[name]);
  });

  it('carries nothing the registry no longer names (run `npm run gen:glyphs`)', () => {
    const named = new Set<string>(Object.values(Icons).map((glyph) => glyph.md));
    expect(Object.keys(MaterialGlyphs).filter((name) => !named.has(name))).toEqual([]);
  });
});
