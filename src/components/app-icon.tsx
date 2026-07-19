import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView } from 'expo-symbols';
import { Platform, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Icons, type IconName } from '@/constants/icons';

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
  style?: StyleProp<ViewStyle>;
};

/**
 * One in-content glyph, resolved per platform: an SF Symbol on iOS, a Material icon on Android —
 * the same native convention the tab bar and nav headers use. Always prefer this over importing a
 * raw `MaterialIcons`, so an icon is native to whichever OS it renders on.
 */
export function AppIcon({ name, size = 22, color, style }: Props) {
  const glyph = Icons[name];
  if (Platform.OS === 'ios') {
    return <SymbolView name={glyph.sf} size={size} tintColor={color} type="monochrome" style={style} />;
  }
  return 'materialCommunity' in glyph ? (
    <MaterialCommunityIcons name={glyph.materialCommunity} size={size} color={color} style={style as StyleProp<TextStyle>} />
  ) : (
    <MaterialIcons name={glyph.material} size={size} color={color} style={style as StyleProp<TextStyle>} />
  );
}
