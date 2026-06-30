import { Stack, useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { DiscoverFilterChips, type Filter } from '@/components/discover-filter-chips';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
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
  const { habits, stacks, createHabit, createHabits, createStack, deleteHabit, error, dismissError } = useHabits();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  // Defer the term that drives filtering so the list's layout animation doesn't re-fire on
  // every keystroke — the TextInput still tracks `query` instantly.
  const deferred = useDeferredValue(query);
  const q = deferred.trim().toLowerCase();
  const searching = q.length > 0;
  const isDefault = filter === 'all' && !searching;

  // Normalized name → habit, so a row can both answer "already added?" and undo its own add
  // by deleting the exact habit it created (the ✓ becomes tap-to-remove).
  const habitByName = useMemo(() => new Map(habits.map((h) => [norm(h.name), h])), [habits]);
  const existing = useMemo(() => new Set(habitByName.keys()), [habitByName]);
  const existingStacks = useMemo(() => new Set(stacks.map((s) => norm(s.name))), [stacks]);

  const removePreset = useCallback(
    (preset: SunnahPreset) => {
      const habit = habitByName.get(norm(preset.name));
      if (habit) void deleteHabit(habit.id);
    },
    [habitByName, deleteHabit],
  );

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

  // Section-level enter + reflow as chips/search change (reduced-motion drops the reflow). No
  // per-section *exit*: the native stack already animates this whole screen out on a back-pop,
  // and a Reanimated `exiting` on these children reparents them into an overlay mid-transition,
  // so they "fly" over the header as the screen slides away (the violet add-pills most visibly).
  //
  // The same reparenting bites on the way *in*: an `entering`/`layout` that runs while this
  // screen is being pushed gets hoisted into the stack's transition overlay, so a section card
  // (most visibly the violet "essentials" starter) flies over the header. So arm the animations
  // only AFTER the push settles — the initially-visible sections then mount un-animated (the
  // native slide is their entrance), while later chip/search reflows still fade and shift.
  const [entryReady, setEntryReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntryReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const layout = entryReady && !reduceMotion ? LinearTransition.duration(Duration.base) : undefined;
  const enter = entryReady ? FadeIn.duration(Duration.base) : undefined;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Standard header — the centered "Add Habit" title (set on the route) is enough, with a
          persistent + that keeps "create your own" one tap away from anywhere on the screen. */}
      <Stack.Screen
        options={{
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

      {/* The search field is the native nav-bar search (UISearchController on iOS / the
          SearchView on Android), not an in-body input — a true platform search experience.
          `hideWhenScrolling` is off so findability stays pinned for this ~60-item library;
          its own clear (✕) and Cancel replace the custom ones. */}
      <Stack.SearchBar
        placeholder="Search Sunnah habits"
        autoCapitalize="none"
        hideWhenScrolling={false}
        onChangeText={(e) => setQuery(e.nativeEvent.text)}
        tintColor={theme.accent}
        textColor={theme.text}
        hintTextColor={theme.textSecondary}
        headerIconColor={theme.textSecondary}
      />

      {/* Filter chips are a real sticky ScrollView header (via AppScreen `stickyHeader`) — still
          pinned under the native search bar for findability, but a descendant of the single tracked
          scroll. As an outside-the-scroll sibling they sat un-inset at the screen's true top and
          react-native-screens flashed them over the header on the back-swipe (the violet "All" pill
          + grey chips). The route's centered "Add Habit" is the title. */}
      <AppScreen
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickyHeader={
          <View style={[styles.controls, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
            <DiscoverFilterChips filters={FILTERS} active={filter} onChange={setFilter} />
          </View>
        }>
        {/* Add failures (network) surface here, at the point of action — otherwise the optimistic
            ✓ pill just reverts and the only message would appear back on the Habits list. */}
        <ErrorBanner message={error} onDismiss={dismissError} />
        {searching ? (
          resultCount === 0 ? (
            <Animated.View key="empty" entering={enter}>
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
            <Animated.View key="results" entering={enter} layout={layout}>
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
                    onRemove={() => removePreset(preset)}
                  />
                ))}
              </SettingsSection>
            </Animated.View>
          )
        ) : (
          <>
            {/* One-tap starter set for a new user — only in the default browse view. */}
            {isDefault && starterRemaining.length > 0 ? (
              <Animated.View key="starter" entering={enter} layout={layout}>
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
              <Animated.View key="routines" entering={enter} layout={layout}>
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
              <Animated.View key={category.id} entering={enter} layout={layout}>
                <SettingsSection title={category.title} footer={category.footer}>
                  {presets.map((preset) => (
                    <SunnahPresetRow
                      key={preset.id}
                      preset={preset}
                      added={existing.has(norm(preset.name))}
                      onAdd={() => void createHabit(toCreate(preset))}
                      onRemove={() => removePreset(preset)}
                    />
                  ))}
                </SettingsSection>
              </Animated.View>
            ))}

            {/* Manual entry, surfaced as a fallback once the curated library has had its say
                (flexibility-after-failure); the header + offers it persistently too. */}
            {isDefault ? (
              <Animated.View key="create" entering={enter} layout={layout}>
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
  starter: { gap: Spacing.two },
  starterButton: { marginTop: Spacing.one, alignSelf: 'flex-start' },
});
