import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolView } from 'expo-symbols';
import { Platform, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Icons, type IconName } from '@/constants/icons';

type Props = {
  /** Semantic icon name from the {@link Icons} registry. */
  name: IconName;
  /** Point size. The Material glyph keeps its exact prior size on Android; the SF Symbol renders
   *  at the same point size on iOS (optical scale differs slightly — tune per call if needed). */
  size: number;
  color: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * One in-content glyph, resolved per platform: an SF Symbol on iOS, a Material icon on Android —
 * the same native convention the tab bar and nav headers use. Always prefer this over importing a
 * raw `MaterialIcons`, so an icon is native to whichever OS it renders on.
 */
export function AppIcon({ name, size, color, style }: Props) {
  const glyph = Icons[name];
  return Platform.OS === 'ios' ? (
    <SymbolView name={glyph.sf} size={size} tintColor={color} type="monochrome" style={style} />
  ) : (
    <MaterialIcons name={glyph.material} size={size} color={color} style={style as StyleProp<TextStyle>} />
  );
}
