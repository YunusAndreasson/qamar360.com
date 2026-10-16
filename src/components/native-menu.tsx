import { MenuView, type MenuAction, type MenuComponentRef } from '@expo/ui/community/menu';
import { useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { TRAILING_BOX, TRAILING_GLYPH, trailingGlyphBox } from '@/components/row-trailing-button';
import { Icons, type IconName } from '@/constants/icons';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';

/** One menu item. `icon` names a registry glyph; iOS draws its SF Symbol beside the title, the way
 *  system menus mark Edit and Delete (Android's menu draws no glyph from a symbol name). */
type Action = { id: string; title: string; icon?: IconName; destructive?: boolean; onSelect: () => void };

export function RowMenu({ label, actions }: { label: string; actions: Action[] }) {
  const menuRef = useRef<MenuComponentRef>(null);
  const theme = useTheme();
  const scheme = useEffectiveScheme();
  const items: MenuAction[] = actions.map(({ id, title, icon, destructive }) => ({
    id,
    title,
    image: icon ? Icons[icon].sf : undefined,
    attributes: { destructive },
  }));
  return (
    <MenuView ref={menuRef} colorScheme={scheme} actions={items} style={styles.menu}
      onPressAction={({ nativeEvent }) => actions.find((action) => action.id === nativeEvent.event)?.onSelect()}>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityActions={Platform.OS === 'android' ? [{ name: 'activate', label: 'Open options' }] : undefined}
        onAccessibilityAction={Platform.OS === 'android' ? () => menuRef.current?.show() : undefined}
        style={styles.trigger}>
        <AppIcon name="ellipsis" size={TRAILING_GLYPH} color={theme.textSecondary} />
      </View>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  menu: { position: 'absolute', right: 0, top: 0, bottom: 0, width: TRAILING_BOX },
  // The glyph on the same line as every other trailing mark on the day: right-aligned inside the
  // box with the shared padding, rather than centred in it (which put it 4pt further in).
  trigger: { flex: 1, minHeight: 48, alignItems: 'flex-end', justifyContent: 'center', ...trailingGlyphBox },
});
