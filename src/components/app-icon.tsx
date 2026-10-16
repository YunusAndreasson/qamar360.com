import createIconSet from '@expo/vector-icons/createIconSet';
import { SymbolView } from 'expo-symbols';
import materialSymbols from 'expo-symbols/androidWeights/regular';
import { Platform } from 'react-native';

import { Icons, type IconGlyph, type IconName } from '@/constants/icons';
import { MaterialGlyphs } from '@/constants/material-glyphs';

type Props = {
  /** Semantic icon name from the {@link Icons} registry. */
  name: IconName;
  /** Point size. Defaults to 22 — the app's standard in-content glyph (row leaders, editor and
   *  settings glyphs); pass a size only where the context is denser (inline chevrons, chip
   *  glyphs) or grander (feature marks, empty-state heroes). The Material glyph keeps its exact
   *  size on Android; the SF Symbol renders at the same point size on iOS (optical scale
   *  differs slightly — tune per call if needed). */
  size?: number;
  color: string;
};

/**
 * Material Symbols as an icon font — the family the tab bar draws on Android, where expo-symbols
 * renders its own icons from this same font file. Not `SymbolView` itself: on Android that loads
 * its font in an effect on every mount, so every icon paints one empty frame before its glyph.
 * Here the font is preloaded with the app's own (see {@link MaterialSymbolsFont}), and an icon is
 * there on its first frame.
 */
const MaterialSymbol = createIconSet(MaterialGlyphs, materialSymbols.name, materialSymbols.font);

/** The Material Symbols font, for the root `useFonts` — Android only; iOS draws SF Symbols. */
export const MaterialSymbolsFont = { [materialSymbols.name]: materialSymbols.font };

/**
 * The one per-platform glyph fork — an SF Symbol on iOS, a Material Symbol on Android.
 * {@link AppIcon} keys it by registry name; the header button passes a glyph record directly. A
 * single definition so the resolution rule can never drift between the two.
 */
export function GlyphIcon({ glyph, size, color }: { glyph: IconGlyph; size: number; color: string }) {
  if (Platform.OS === 'ios') {
    return <SymbolView name={glyph.sf} size={size} tintColor={color} type="monochrome" />;
  }
  return <MaterialSymbol name={glyph.md} size={size} color={color} />;
}

/**
 * One in-content glyph, resolved per platform: an SF Symbol on iOS, a Material Symbol on Android —
 * the same native convention the tab bar and nav headers use. Always prefer this over drawing a
 * raw icon font, so an icon is native to whichever OS it renders on.
 */
export function AppIcon({ name, size = 22, color }: Props) {
  return <GlyphIcon glyph={Icons[name]} size={size} color={color} />;
}
