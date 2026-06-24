import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Pressed, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { ReactNode } from 'react';

type Props = {
  /** Leading MaterialIcons glyph. */
  icon?: keyof typeof MaterialIcons.glyphMap;
  label: string;
  /** Secondary line under the label. */
  sublabel?: string;
  /** Right-aligned muted value (e.g. a version number). Ignored when `trailing` is set. */
  value?: string;
  /** Custom right-side node (e.g. a `<Switch>`). Overrides `value` and the chevron. */
  trailing?: ReactNode;
  /** Show a chevron — for rows that navigate to another screen. */
  showChevron?: boolean;
  onPress?: () => void;
  /** Tint the icon + label with the danger color (destructive actions). */
  destructive?: boolean;
  disabled?: boolean;
  /** Swap the trailing area for a spinner while an async action runs. */
  busy?: boolean;
  accessibilityLabel?: string;
};

/**
 * One line inside a {@link SettingsSection} card. Renders as a static `View` unless `onPress`
 * is set, in which case it becomes a pressable matching the app's row idiom (`habit-row.tsx`).
 */
export function SettingsRow({
  icon,
  label,
  sublabel,
  value,
  trailing,
  showChevron,
  onPress,
  destructive,
  disabled,
  busy,
  accessibilityLabel,
}: Props) {
  const theme = useTheme();
  const labelColor = destructive ? theme.danger : theme.text;
  const iconColor = destructive ? theme.danger : theme.textSecondary;

  const content = (
    <>
      {icon ? <MaterialIcons name={icon} size={22} color={iconColor} /> : null}
      <View style={styles.labels}>
        <ThemedText type="default" style={{ color: labelColor }} numberOfLines={1}>
          {label}
        </ThemedText>
        {sublabel ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {sublabel}
          </ThemedText>
        ) : null}
      </View>
      {busy ? (
        <ActivityIndicator color={iconColor} />
      ) : trailing ? (
        trailing
      ) : value ? (
        <ThemedText type="small" themeColor="textSecondary">
          {value}
        </ThemedText>
      ) : showChevron ? (
        <MaterialIcons name="chevron-right" size={22} color={theme.textSecondary} />
      ) : null}
    </>
  );

  if (!onPress) return <View style={styles.row}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!(disabled || busy) }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, (disabled || busy) && styles.faded]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  labels: { flex: 1, gap: Spacing.half },
  pressed: { opacity: Pressed.dim },
  faded: { opacity: 0.5 },
});
