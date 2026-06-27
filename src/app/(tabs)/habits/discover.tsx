import { Stack, useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { DiscoverFilterChips, type Filter } from '@/components/discover-filter-chips';
import { DiscoverSearchBar } from '@/components/discover-search-bar';
import { EmptyState } from '@/components/empty-state';
import { HeaderActions, HeaderIconButton } from '@/components/header-icon-button';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { SunnahPresetRow } from '@/components/sunnah-preset-row';
import { SunnahRoutineRow } from '@/components/sunnah-routine-row';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { HeaderIcons } from '@/constants/icons';
import { Duration } from '@/constants/motion';
import {
  ESSENTIAL_PRESETS,
  routinePresets,
  SUNNAH_CATEGORIES,
  SUNNAH_PRESETS,
  SUNNAH_ROUTINES,
  type SunnahCategory,
  type SunnahPreset,
  type SunnahRoutine,
} from '@/constants/sunnah-habits';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';

const norm = (name: string) => name.trim().toLowerCase();

const toCreate = (preset: SunnahPreset) => ({
  name: preset.name,
  // Hijri presets store empty weekdays + a hijri_schedule; weekly presets the reverse.
  schedule_days: preset.hijriSchedule ? [] : preset.defaultSchedule,
  hijri_schedule: preset.hijriSchedule ?? null,
  // Reminders are opt-in: presets never pre-schedule a notification (this is a habit
  // tracker, not a prayer-times app). The user sets a time per habit in the editor.
  reminder_time: null,
});

/** 'all' | 'routines' | a category id — the active chip narrows the corpus searched. */
type FilterId = 'all' | 'routines' | SunnahCategory['id'];

// All → Routines → one chip per category, built once from the category list.
const FILTERS: Filter[] = [
  { id: 'all', label: 'All' },
  { id: 'routines', label: 'Routines' },
  ...SUNNAH_CATEGORIES.map((c) => ({ id: c.id, label: c.title })),
];

/**
 * Discover — a curated, evidence-backed library of SMART Sunnah habits. Search or filter to
 * find one fast, then add it with a single tap from the row (no need to expand first); expand
 * to read how it's tracked and its Sunnah source. Manual entry lives at the foot and in the
 * persistent header +. A pushed sub-screen of the Habits Stack, so it shares `HabitsProvider`.
 */
export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { habits, stacks, createHabit, createHabits, createStack } = useHabits();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  // Defer the term that drives filtering so the list's layout animation doesn't re-fire on
  // every keystroke — the TextInput still tracks `query` instantly.
  const deferred = useDeferredValue(query);
  const q = deferred.trim().toLowerCase();
  const searching = q.length > 0;
  const isDefault = filter === 'all' && !searching;

  // Normalized names already in the user's list → O(1) "already added?" checks.
  const existing = useMemo(() => new Set(habits.map((h) => norm(h.name))), [habits]);
  const existingStacks = useMemo(() => new Set(stacks.map((s) => norm(s.name))), [stacks]);

  // The starter set, minus anything already added.
  const starterRemaining = useMemo(
    () => ESSENTIAL_PRESETS.filter((p) => !existing.has(norm(p.name))),
    [existing],
  );

  // Routines visible under the current chip + search term (the two are ANDed).
  const visibleRoutines = useMemo(() => {
    if (filter !== 'all' && filter !== 'routines') return [];
    return SUNNAH_ROUTINES.filter(
      (r) => r.name.toLowerCase().includes(q) || r.detail.toLowerCase().includes(q),
    );
  }, [filter, q]);

  // Presets grouped by category, each gated by the chip then the search term. Empty
  // categories drop out so a filtered view shows no bare headers.
  const categorySections = useMemo(
    () =>
      SUNNAH_CATEGORIES.filter((c) => filter === 'all' || filter === c.id)
        .map((category) => ({
          category,
          presets: SUNNAH_PRESETS.filter(
            (p) =>
              p.categoryId === category.id &&
              (p.name.toLowerCase().includes(q) || p.detail.toLowerCase().includes(q)),
          ),
        }))
        .filter((s) => s.presets.length > 0),
    [filter, q],
  );

  const flatPresets = useMemo(() => categorySections.flatMap((s) => s.presets), [categorySections]);
  const resultCount = visibleRoutines.length + flatPresets.length;

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

  const goCreateHabit = () => router.push({ pathname: '/habits/editor', params: { id: 'new' } });
  const goCreateStack = () => router.push({ pathname: '/habits/stack-editor', params: { id: 'new' } });

  // Section-level enter/exit + reflow as chips/search change (reduced-motion drops the reflow).
  const layout = reduceMotion ? undefined : LinearTransition.duration(Duration.base);
  const enter = FadeIn.duration(Duration.base);
  const exit = FadeOut.duration(Duration.fast);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Standard header (the custom two-line title lives in-body, below) with a persistent +
          that keeps "create your own" one tap away from anywhere on the screen. */}
      <Stack.Screen
        options={{
          headerTitle: () => null,
          headerRight: () => (
            <HeaderActions>
              <HeaderIconButton
                icon={HeaderIcons.add}
                color={theme.accent}
                accessibilityLabel="Create your own habit"
                onPress={goCreateHabit}
              />
            </HeaderActions>
          ),
        }}
      />

      {/* Pinned controls — title + search + chips stay put so findability never scrolls away. */}
      <View style={[styles.controls, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <ThemedText type="subtitleBold" style={styles.title} accessibilityRole="header">
          Add a habit{'\n'}or routine
        </ThemedText>
        <View style={styles.searchWrap}>
          <DiscoverSearchBar value={query} onChangeText={setQuery} onClear={() => setQuery('')} />
        </View>
        <DiscoverFilterChips filters={FILTERS} active={filter} onChange={setFilter} />
      </View>

      <AppScreen
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled">
        {searching ? (
          resultCount === 0 ? (
            <Animated.View key="empty" entering={enter} exiting={exit}>
              <EmptyState
                icon="search-off"
                title={`No matches for “${query.trim()}”`}
                body="Try another word, or create your own.">
                <AppButton
                  variant="secondary"
                  onPress={goCreateHabit}
                  accessibilityLabel="Create your own habit">
                  Create your own
                </AppButton>
              </EmptyState>
            </Animated.View>
          ) : (
            <Animated.View key="results" entering={enter} exiting={exit} layout={layout}>
              <SettingsSection title={`${resultCount} result${resultCount === 1 ? '' : 's'}`}>
                {visibleRoutines.map((routine) => (
                  <SunnahRoutineRow
                    key={routine.id}
                    routine={routine}
                    added={existingStacks.has(norm(routine.name))}
                    onAdd={() => void addRoutine(routine)}
                  />
                ))}
                {flatPresets.map((preset) => (
                  <SunnahPresetRow
                    key={preset.id}
                    preset={preset}
                    added={existing.has(norm(preset.name))}
                    onAdd={() => void createHabit(toCreate(preset))}
                  />
                ))}
              </SettingsSection>
            </Animated.View>
          )
        ) : (
          <>
            {/* One-tap starter set for a new user — only in the default browse view. */}
            {isDefault && starterRemaining.length > 0 ? (
              <Animated.View key="starter" entering={enter} exiting={exit} layout={layout}>
                <Surface padded pattern style={[styles.starter, { backgroundColor: theme.accentSubtle }]}>
                  <ThemedText type="smallBold" themeColor="accent">
                    New here? Start with the essentials
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Start with the moments already in your day: prayer times, morning and evening
                    adhkār, and a daily page of Qurʾān.
                  </ThemedText>
                  <AppButton
                    onPress={() => void createHabits(starterRemaining.map(toCreate))}
                    accessibilityLabel={`Add starter set of ${starterRemaining.length} habits`}
                    style={styles.starterButton}>
                    Add starter set ({starterRemaining.length})
                  </AppButton>
                </Surface>
              </Animated.View>
            ) : null}

            {/* Routines — ready-made stacks of habits that belong together as a sequence. */}
            {visibleRoutines.length > 0 ? (
              <Animated.View key="routines" entering={enter} exiting={exit} layout={layout}>
                <SettingsSection title="Routines" footer="You still complete each habit on its own.">
                  {visibleRoutines.map((routine) => (
                    <SunnahRoutineRow
                      key={routine.id}
                      routine={routine}
                      added={existingStacks.has(norm(routine.name))}
                      onAdd={() => void addRoutine(routine)}
                    />
                  ))}
                </SettingsSection>
              </Animated.View>
            ) : null}

            {categorySections.map(({ category, presets }) => (
              <Animated.View key={category.id} entering={enter} exiting={exit} layout={layout}>
                <SettingsSection title={category.title} footer={category.footer}>
                  {presets.map((preset) => (
                    <SunnahPresetRow
                      key={preset.id}
                      preset={preset}
                      added={existing.has(norm(preset.name))}
                      onAdd={() => void createHabit(toCreate(preset))}
                    />
                  ))}
                </SettingsSection>
              </Animated.View>
            ))}

            {/* Manual entry, surfaced as a fallback once the curated library has had its say
                (flexibility-after-failure); the header + offers it persistently too. */}
            {isDefault ? (
              <Animated.View key="create" entering={enter} exiting={exit} layout={layout}>
                <SettingsSection title="Can't find it?">
                  <SettingsRow
                    icon="add"
                    label="Create your own habit"
                    showChevron
                    accessibilityLabel="Create your own habit"
                    onPress={goCreateHabit}
                  />
                  <SettingsRow
                    icon="add-link"
                    label="Create your own stack"
                    sublabel="Build a routine from one cue"
                    showChevron
                    accessibilityLabel="Create your own stack"
                    onPress={goCreateStack}
                  />
                </SettingsSection>
              </Animated.View>
            ) : null}
          </>
        )}
      </AppScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  controls: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { paddingHorizontal: Spacing.three },
  searchWrap: { paddingHorizontal: Spacing.three },
  starter: { gap: Spacing.two },
  starterButton: { marginTop: Spacing.one, alignSelf: 'flex-start' },
});
