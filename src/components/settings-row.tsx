import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/constants/icons';
import { Disabled, Pressed, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  /** Leading glyph (semantic name from the icon registry). */
  icon?: IconName;
  label: string;
  /** Secondary line under the label. */
  sublabel?: string;
  /** Right-aligned muted value (e.g. a version number). */
  value?: string;
  /** Show a chevron — for rows that navigate to another screen. */
  showChevron?: boolean;
  onPress?: () => void;
  /** Tint the icon + label with the danger color (destructive actions). */
  destructive?: boolean;
  disabled?: boolean;
  /** Swap the trailing area for a spinner while an async action runs. */
  busy?: boolean;
  /** Make this a toggle row: the trailing area becomes a `Switch` over this value. */
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
  accessibilityLabel?: string;
};

/**
 * One line inside a {@link SettingsSection} card. Renders as a static `View` unless `onPress`
 * is set, in which case it becomes a pressable matching the app's row idiom (`habit-row.tsx`).
 * A `switchValue` row is always static: as in the platform's own Settings, the switch is the
 * only target — the row around it isn't tappable.
 */
export function SettingsRow({
  icon,
  label,
  sublabel,
  value,
  showChevron,
  onPress,
  destructive,
  disabled,
  busy,
  switchValue,
  onSwitchChange,
  accessibilityLabel,
}: Props) {
  const theme = useTheme();
  const labelColor = destructive ? theme.danger : theme.text;
  const iconColor = destructive ? theme.danger : theme.textSecondary;

  const content = (
    <>
      {icon ? <AppIcon name={icon} color={iconColor} /> : null}
      <View style={styles.labels}>
        <ThemedText type="rowTitle" style={{ color: labelColor }} numberOfLines={1}>
          {label}
        </ThemedText>
        {sublabel ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {sublabel}
          </ThemedText>
        ) : null}
      </View>
      {switchValue !== undefined ? (
        // No app haptic here: a `Switch` is a native control and the OS already vibrates for it
        // (see the haptics vocabulary). Same theming as the editor's reminder switch.
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          disabled={disabled}
          trackColor={{ true: theme.accent, false: theme.backgroundSelected }}
          ios_backgroundColor={theme.backgroundSelected}
          accessibilityLabel={accessibilityLabel ?? label}
        />
      ) : busy ? (
        <ActivityIndicator color={iconColor} />
      ) : value ? (
        <ThemedText type="small" themeColor="textSecondary">
          {value}
        </ThemedText>
      ) : showChevron ? (
        <AppIcon name="chevronRight" size={16} color={theme.textSecondary} />
      ) : null}
    </>
  );

  if (!onPress || switchValue !== undefined) return <View style={styles.row}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (value ? `${label}, ${value}` : label)}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, (disabled || busy) && styles.faded]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The iOS-standard grouped-list row: 44pt (the platform's row height + minimum tap target), with
  // tight vertical padding so a single-line row sits at 44 and a two-line (sublabel) row grows just
  // enough — closer to a native Settings list than the app's old roomier 48/62 rows.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  labels: { flex: 1, gap: Spacing.half },
  pressed: { opacity: Pressed.dim },
  faded: { opacity: Disabled },
});
