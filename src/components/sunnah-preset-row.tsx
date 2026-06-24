import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { scheduleSummary, type SunnahPreset } from '@/constants/sunnah-habits';
import { Pressed, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

type Props = {
  preset: SunnahPreset;
  /** Whether a habit with this preset's name already exists. */
  added: boolean;
  onAdd: () => void;
};

/**
 * One Sunnah preset inside a {@link SettingsSection} card: a tappable header that
 * expands in place (accordion) to reveal the precise "what counts as done" detail,
 * the Sunnah evidence, and a prominent "Add to my habits" button — so the user reads
 * the why exactly where they decide. Visually matches {@link SettingsRow}.
 */
export function SunnahPresetRow({ preset, added, onAdd }: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    haptics.selection();
    setExpanded((v) => !v);
  };

  const add = () => {
    if (added) return;
    haptics.completed();
    onAdd();
  };

  const summary = scheduleSummary(preset.defaultSchedule, preset.defaultReminder);

  return (
    <View>
      <Pressable
        onPress={toggle}
        android_ripple={{ color: theme.backgroundSelected }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${preset.name}. ${summary}.${added ? ' Added.' : ''}`}
        accessibilityHint={expanded ? 'Collapse details' : 'Show details and add'}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <MaterialIcons name={preset.icon} size={22} color={theme.accent} />
        <View style={styles.labels}>
          <ThemedText type="default" numberOfLines={1}>
            {preset.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {summary}
          </ThemedText>
        </View>
        {added ? (
          <MaterialIcons name="check-circle" size={20} color={theme.accent} />
        ) : null}
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={22}
          color={theme.textSecondary}
        />
      </Pressable>

      {expanded ? (
        <Animated.View
          entering={FadeIn.duration(160)}
          exiting={FadeOut.duration(120)}
          style={styles.detail}>
          <ThemedText type="small" style={{ color: theme.text }}>
            {preset.detail}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.evidence}>
            {preset.evidence}
          </ThemedText>
          <Pressable
            onPress={add}
            disabled={added}
            android_ripple={added ? undefined : { color: theme.backgroundSelected }}
            accessibilityRole="button"
            accessibilityState={{ disabled: added }}
            accessibilityLabel={added ? `${preset.name} added` : `Add ${preset.name} to my habits`}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: added ? theme.accentSubtle : theme.accent },
              pressed && !added && styles.buttonPressed,
            ]}>
            <ThemedText
              type="smallBold"
              style={{ color: added ? theme.accent : theme.accentText }}>
              {added ? 'Added ✓' : 'Add to my habits'}
            </ThemedText>
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
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
  detail: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    paddingTop: Spacing.one,
    gap: Spacing.two,
  },
  evidence: { fontStyle: 'italic' },
  button: {
    marginTop: Spacing.one,
    borderRadius: Radius.control,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: Pressed.dim },
});
