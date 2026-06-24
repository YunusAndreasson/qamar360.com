import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { SunnahPresetRow } from '@/components/sunnah-preset-row';
import { SunnahRoutineRow } from '@/components/sunnah-routine-row';
import { ThemedText } from '@/components/themed-text';
import {
  ESSENTIAL_PRESETS,
  routinePresets,
  SUNNAH_CATEGORIES,
  SUNNAH_PRESETS,
  SUNNAH_ROUTINES,
  type SunnahPreset,
  type SunnahRoutine,
} from '@/constants/sunnah-habits';
import { BottomTabInset, MaxContentWidth, Pressed, Radius, Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';

const norm = (name: string) => name.trim().toLowerCase();

const toCreate = (preset: SunnahPreset) => ({
  name: preset.name,
  schedule_days: preset.defaultSchedule,
  reminder_time: preset.defaultReminder,
});

/**
 * Discover — a curated, evidence-backed library of SMART Sunnah habits. Browse by category,
 * expand a row to read how it's tracked and its Sunnah source, then add it with one tap. A
 * pushed sub-screen of the Habits Stack, so it shares `HabitsProvider`.
 */
export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { habits, stacks, createHabit, createHabits, createStack } = useHabits();

  // Normalized names already in the user's list → O(1) "already added?" checks.
  const existing = useMemo(() => new Set(habits.map((h) => norm(h.name))), [habits]);
  const existingStacks = useMemo(() => new Set(stacks.map((s) => norm(s.name))), [stacks]);

  // The starter set, minus anything already added.
  const starterRemaining = useMemo(
    () => ESSENTIAL_PRESETS.filter((p) => !existing.has(norm(p.name))),
    [existing],
  );

  // Add a routine: create any missing member habits, then group them all in sequence.
  const addRoutine = useCallback(
    async (routine: SunnahRoutine) => {
      const presets = routinePresets(routine);
      if (presets.length < 2) return;
      const byName = new Map(habits.map((h) => [norm(h.name), h]));
      const missing = presets.filter((p) => !byName.has(norm(p.name)));
      const created = missing.length > 0 ? await createHabits(missing.map(toCreate)) : [];
      if (created.length !== missing.length) return; // a create failed — error already shown
      for (const h of created) byName.set(norm(h.name), h);
      const orderedIds: string[] = [];
      for (const p of presets) {
        const h = byName.get(norm(p.name));
        if (h) orderedIds.push(h.id);
      }
      if (orderedIds.length >= 2) await createStack(routine.name, orderedIds);
    },
    [habits, createHabits, createStack],
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}>
      {/* Create your own — the two manual paths, grouped at the top so "add a habit" is
          one screen: build it yourself here, or pick from the curated library below. */}
      <SettingsSection title="Create your own">
        <SettingsRow
          icon="add"
          label="Habit"
          showChevron
          accessibilityLabel="Create your own habit"
          onPress={() => router.push({ pathname: '/habits/editor', params: { id: 'new' } })}
        />
        <SettingsRow
          icon="add-link"
          label="Stack"
          sublabel="Group habits into one sequence"
          showChevron
          accessibilityLabel="Create your own stack"
          onPress={() => router.push({ pathname: '/habits/stack-editor', params: { id: 'new' } })}
        />
      </SettingsSection>

      {/* One-tap starter set for a new user — hidden once the essentials are all added. */}
      {starterRemaining.length > 0 ? (
        <View style={[styles.starter, { backgroundColor: theme.accentSubtle, borderColor: theme.border }]}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            New here? Start with the essentials
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            The five daily prayers, morning &amp; evening adhkār, and a daily page of Qurʾān — a
            balanced day in one tap.
          </ThemedText>
          <Pressable
            onPress={() => void createHabits(starterRemaining.map(toCreate))}
            android_ripple={{ color: theme.backgroundSelected }}
            accessibilityRole="button"
            accessibilityLabel={`Add starter set of ${starterRemaining.length} habits`}
            style={({ pressed }) => [
              styles.starterButton,
              { backgroundColor: theme.accent },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="smallBold" style={{ color: theme.accentText }}>
              Add starter set ({starterRemaining.length})
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {/* Routines — ready-made stacks of habits that belong together as a sequence. */}
      <SettingsSection
        title="Routines"
        footer="A stack groups related habits into one sequence on your list. You still complete each one.">
        {SUNNAH_ROUTINES.map((routine) => (
          <SunnahRoutineRow
            key={routine.id}
            routine={routine}
            added={existingStacks.has(norm(routine.name))}
            onAdd={() => void addRoutine(routine)}
          />
        ))}
      </SettingsSection>

      {SUNNAH_CATEGORIES.map((category) => {
        const presets = SUNNAH_PRESETS.filter((p) => p.categoryId === category.id);
        if (presets.length === 0) return null;
        return (
          <SettingsSection key={category.id} title={category.title} footer={category.footer}>
            {presets.map((preset) => (
              <SunnahPresetRow
                key={preset.id}
                preset={preset}
                added={existing.has(norm(preset.name))}
                onAdd={() => void createHabit(toCreate(preset))}
              />
            ))}
          </SettingsSection>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  starter: {
    borderRadius: Radius.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  starterButton: {
    marginTop: Spacing.one,
    alignSelf: 'flex-start',
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
  },
  pressed: { opacity: Pressed.dim },
});
