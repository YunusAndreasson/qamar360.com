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
  /**
   * Swap the trailing area for a spinner while an async action runs, and block the press so a
   * slow one can't be fired twice — which is what "Reset progress" and "Delete account" want.
   *
   * Only meaningful on a **pressable** row: a static row has no press to block, and a `switchValue`
   * row renders its `Switch` in the same slot the spinner would take AND returns before the
   * `Pressable` below, so `busy` neither shows nor gates anything there. No caller sets it on one;
   * a switch that needs gating would need a real `disabled` prop rather than this.
   */
  busy?: boolean;
  /** Make this a toggle row: the trailing area becomes a `Switch` over this value. */
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
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
  busy,
  switchValue,
  onSwitchChange,
}: Props) {
  const theme = useTheme();
  const labelColor = destructive ? theme.danger : theme.text;
  const iconColor = destructive ? theme.danger : theme.textSecondary;

  const content = (
    <>
      {icon ? <AppIcon name={icon} color={iconColor} /> : null}
      <View style={styles.labels}>
        <ThemedText type="rowTitle" style={{ color: labelColor }} numberOfLines={switchValue !== undefined ? 2 : 1}>
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
        // (see the haptics vocabulary).
        <Switch
          value={switchValue}
          onValueChange={onSwitchChange}
          trackColor={{ true: theme.accent, false: theme.backgroundSelected }}
          ios_backgroundColor={theme.backgroundSelected}
          accessibilityLabel={label}
        />
      ) : busy ? (
        <ActivityIndicator color={iconColor} />
      ) : value || showChevron ? (
        // A row that opens something keeps its chevron even when it states a value — the iOS
        // Settings idiom ("Hijri date  As calculated  ›"). The value used to win outright, so the
        // two rows that both state and open looked like read-outs nobody could tap. One group that
        // never shrinks, so the label beside it is what gives way.
        <View style={styles.trailing}>
          {value ? (
            <ThemedText type="small" themeColor="textSecondary">
              {value}
            </ThemedText>
          ) : null}
          {showChevron ? <AppIcon name="chevronRight" size={16} color={theme.textSecondary} /> : null}
        </View>
      ) : null}
    </>
  );

  if (!onPress || switchValue !== undefined) return <View style={styles.row}>{content}</View>;

  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="button"
      // The trailing value is part of what the row says ("Hijri date, one day earlier"), so it is
      // spoken with the label rather than left to be discovered as a second element.
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={{ disabled: !!busy, busy: !!busy }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, busy && styles.faded]}>
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
  trailing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, flexShrink: 0 },
  pressed: { opacity: Pressed.dim },
  faded: { opacity: Disabled },
});
