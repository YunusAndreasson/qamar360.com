import { describe, expect, it } from '@jest/globals';

import { mixHex, withAlpha } from '@/lib/color';

describe('withAlpha', () => {
  it('appends the alpha as a two-digit hex byte', () => {
    expect(withAlpha('#F4EACB', 1)).toBe('#F4EACBff');
    expect(withAlpha('#F4EACB', 0)).toBe('#F4EACB00');
    expect(withAlpha('#12161D', 0.22)).toBe('#12161D38');
  });

  it('clamps an alpha outside 0–1', () => {
    expect(withAlpha('#000000', 2)).toBe('#000000ff');
    expect(withAlpha('#000000', -1)).toBe('#00000000');
  });
});

describe('mixHex', () => {
  it('runs from one colour to the other', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#1E2B35', '#89C2E3', 0.5)).toBe('#54778c');
  });
});
