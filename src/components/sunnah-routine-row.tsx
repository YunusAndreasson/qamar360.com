import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { routinePresets, type SunnahRoutine } from '@/constants/sunnah-habits';
import { Pressed, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

type Props = {
  routine: SunnahRoutine;
  /** Whether a stack with this routine's name already exists. */
  added: boolean;
  onAdd: () => void;
};

/**
 * One Sunnah routine inside a {@link SettingsSection}: a tappable header that expands to
 * reveal the habit sequence it stacks and an "Add" button. Mirrors {@link SunnahPresetRow}.
 */
export function SunnahRoutineRow({ routine, added, onAdd }: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const members = routinePresets(routine);

  const toggle = () => {
    haptics.selection();
    setExpanded((v) => !v);
  };

  const add = () => {
    if (added) return;
    haptics.completed();
    onAdd();
  };

  return (
    <View>
      <Pressable
        onPress={toggle}
        android_ripple={{ color: theme.backgroundSelected }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${routine.name}. ${members.length} habits.${added ? ' Added.' : ''}`}
        accessibilityHint={expanded ? 'Collapse details' : 'Show the sequence and add'}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
        <MaterialIcons name={routine.icon} size={22} color={theme.accent} />
        <View style={styles.labels}>
          <ThemedText type="default" numberOfLines={1}>
            {routine.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {members.length} habits
          </ThemedText>
        </View>
        {added ? <MaterialIcons name="check-circle" size={20} color={theme.accent} /> : null}
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={theme.textSecondary} />
      </Pressable>

      {expanded ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.detail}>
          <ThemedText type="small" style={{ color: theme.text }}>
            {routine.detail}
          </ThemedText>
          <View style={styles.sequence}>
            {members.map((p, i) => (
              <View key={p.id} style={styles.step}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.ordinal}>
                  {i + 1}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.text, flex: 1 }} numberOfLines={1}>
                  {p.name}
                </ThemedText>
              </View>
            ))}
          </View>
          <Pressable
            onPress={add}
            disabled={added}
            android_ripple={added ? undefined : { color: theme.backgroundSelected }}
            accessibilityRole="button"
            accessibilityState={{ disabled: added }}
            accessibilityLabel={added ? `${routine.name} added` : `Add the ${routine.name} stack`}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: added ? theme.accentSubtle : theme.accent },
              pressed && !added && styles.buttonPressed,
            ]}>
            <ThemedText type="smallBold" style={{ color: added ? theme.accent : theme.accentText }}>
              {added ? 'Added ✓' : 'Add this stack'}
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
  sequence: { gap: Spacing.one, paddingVertical: Spacing.one },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  ordinal: { width: 16, textAlign: 'center' },
  button: {
    marginTop: Spacing.one,
    borderRadius: Radius.control,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: { opacity: Pressed.dim },
});
