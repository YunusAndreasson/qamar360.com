import { MenuView, type MenuAction, type MenuComponentRef } from '@expo/ui/community/menu';
import { useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { TRAILING_BOX } from '@/components/row-trailing-button';
import { useEffectiveScheme, useTheme } from '@/hooks/use-theme';

type Action = { id: string; title: string; destructive?: boolean; onSelect: () => void };

export function RowMenu({ label, actions }: { label: string; actions: Action[] }) {
  const menuRef = useRef<MenuComponentRef>(null);
  const theme = useTheme();
  const scheme = useEffectiveScheme();
  const items: MenuAction[] = actions.map(({ id, title, destructive }) => ({ id, title, attributes: { destructive } }));
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
        <AppIcon name="ellipsis" size={20} color={theme.textSecondary} />
      </View>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  menu: { position: 'absolute', right: 0, top: 0, bottom: 0, width: TRAILING_BOX },
  trigger: { flex: 1, minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center' },
});
