import { Stack, useRouter } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import { AppButton } from '@/components/app-button';
import { DiscoverFilterChips, type Filter } from '@/components/discover-filter-chips';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { SunnahPresetRow } from '@/components/sunnah-preset-row';
import { SunnahRoutineRow } from '@/components/sunnah-routine-row';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import {
  routinePresets,
  type SunnahCategory,
  type SunnahPreset,
  type SunnahRoutine,
} from '@/constants/sunnah-habits';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { normalizeName } from '@/lib/names';

const toCreate = (preset: SunnahPreset) => ({
  name: preset.name,
  // Hijri presets store empty weekdays + a hijri_schedule; weekly presets the reverse.
  schedule_days: preset.hijriSchedule ? [] : preset.defaultSchedule,
  hijri_schedule: preset.hijriSchedule ?? null,
  // A few presets are naturally counted (cups, servings); the rest stay binary.
  target_count: preset.targetCount ?? null,
  target_unit: preset.targetUnit ?? null,
  // Reminders are opt-in: presets never pre-schedule a notification (this is a habit
  // tracker, not a prayer-times app). The user sets a time per habit in the editor.
  reminder_time: null,
});

/** 'all' | 'routines' | a category id — the active chip narrows the corpus searched. */
type FilterId = 'all' | 'routines' | SunnahCategory['id'];

/**
 * One virtualized row of the library — a whole section card (or the banner / empty state), so
 * the grouped-card design survives windowing: a card is never split across cells, and only the
 * on-screen sections mount instead of the full ~60-row library.
 */
type Row =
  | { type: 'banner' }
  | { type: 'empty' }
  | { type: 'results' }
  | { type: 'starter' }
  | { type: 'routines' }
  | { type: 'category'; category: SunnahCategory; presets: SunnahPreset[] }
  | { type: 'create' };

const rowKey = (row: Row) => (row.type === 'category' ? `category-${row.category.id}` : row.type);

/** The breathing room between section cards (tight on purpose — many short cards in a column). */
const SectionGap = () => <View style={styles.gap} />;

/**
 * Discover — a curated, evidence-backed library of SMART Sunnah habits. Search or filter to
 * find one fast, then add it with a single tap from the row (no need to expand first); expand
 * to read how it's tracked and its Sunnah source. Manual entry lives at the foot and in the
 * persistent header +. A pushed sub-screen of the Habits Stack, so it shares `HabitsProvider`.
 * The body is a virtualized FlatList of section cards, so only visible sections mount.
 */
export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { habits, stacks, createHabit, createHabits, createStack, deleteHabit, deleteStack, error, dismissError } =
    useHabits();
  const { categories, presets, routines, essentialPresets } = useCatalog();

  // All → Routines → one chip per category, from the live category list.
  const filters: Filter[] = [
    { id: 'all', label: 'All' },
    { id: 'routines', label: 'Routines' },
    ...categories.map((c) => ({ id: c.id, label: c.title })),
  ];

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  // Defer the term that drives filtering so the section list doesn't rebuild on every
  // keystroke — the native search field still tracks `query` instantly.
  const deferred = useDeferredValue(query);
  const q = deferred.trim().toLowerCase();
  const searching = q.length > 0;
  const isDefault = filter === 'all' && !searching;

  // Normalized name → habit, so a row can both answer "already added?" and undo its own add
  // by deleting the exact habit it created (the ✓ becomes tap-to-remove).
  const habitByName = useMemo(() => new Map(habits.map((h) => [normalizeName(h.name), h])), [habits]);
  const existing = useMemo(() => new Set(habitByName.keys()), [habitByName]);
  const existingStacks = useMemo(() => new Set(stacks.map((s) => normalizeName(s.name))), [stacks]);

  const removePreset = useCallback(
    (preset: SunnahPreset) => {
      const habit = habitByName.get(normalizeName(preset.name));
      if (habit) void deleteHabit(habit.id);
    },
    [habitByName, deleteHabit],
  );

  // Tap-to-undo for an added routine — the same idiom as a preset row: the stack and its
  // member habits go together, as one unit, the way the add created them.
  const removeRoutine = useCallback(
    (routine: SunnahRoutine) => {
      const stack = stacks.find((s) => normalizeName(s.name) === normalizeName(routine.name));
      if (!stack) return;
      const members = habits.filter((h) => h.stack_id === stack.id);
      // Stack first (the row's ✓ keys off the stack name, so it flips back at once), then the
      // members. Done here rather than through deleteHabit's empty-stack detection because
      // these calls land in one tick and the ref that detection consults syncs between renders.
      void deleteStack(stack.id);
      for (const m of members) void deleteHabit(m.id);
    },
    [stacks, habits, deleteStack, deleteHabit],
  );

  // The starter set, minus anything already added.
  const starterRemaining = useMemo(
    () => essentialPresets.filter((p) => !existing.has(normalizeName(p.name))),
    [essentialPresets, existing],
  );

  // Routines visible under the current chip + search term (the two are ANDed).
  const visibleRoutines = useMemo(() => {
    if (filter !== 'all' && filter !== 'routines') return [];
    return routines.filter(
      (r) => r.name.toLowerCase().includes(q) || r.detail.toLowerCase().includes(q),
    );
  }, [routines, filter, q]);

  // Presets grouped by category, each gated by the chip then the search term. Empty
  // categories drop out so a filtered view shows no bare headers.
  const categorySections = useMemo(
    () =>
      categories.filter((c) => filter === 'all' || filter === c.id)
        .map((category) => ({
          category,
          presets: presets.filter(
            (p) =>
              p.categoryId === category.id &&
              (p.name.toLowerCase().includes(q) || p.detail.toLowerCase().includes(q)),
          ),
        }))
        .filter((s) => s.presets.length > 0),
    [categories, presets, filter, q],
  );

  const flatPresets = useMemo(() => categorySections.flatMap((s) => s.presets), [categorySections]);
  const resultCount = visibleRoutines.length + flatPresets.length;

  // The virtualized list's data: one row per section card. The error banner is a row too
  // (only when there is an error, so no phantom cell + separator when there isn't).
  // No manual memo — the React Compiler caches this (and `renderRow` below) by its inputs.
  const rows: Row[] = [];
  if (error) rows.push({ type: 'banner' });
  if (searching) {
    rows.push(resultCount === 0 ? { type: 'empty' } : { type: 'results' });
  } else {
    if (isDefault && starterRemaining.length > 0) rows.push({ type: 'starter' });
    if (visibleRoutines.length > 0) rows.push({ type: 'routines' });
    for (const section of categorySections) rows.push({ type: 'category', ...section });
    // The manual-entry door stays at the foot of every browse view (not just "All") — it is
    // the screen's only create-your-own path now that the header no longer doubles the + glyph.
    rows.push({ type: 'create' });
  }

  // Add a routine: create any missing member habits, then group them all in sequence.
  // The new habits land on the Today list — usually below the fold — so a toast confirms the
  // add where it happened, and its Undo removes exactly what this tap created (the stack plus
  // only the habits that didn't already exist).
  const addRoutine = useCallback(
    async (routine: SunnahRoutine) => {
      // The row is inert once added, but guard against a double-tap racing the state update —
      // without this, two taps create two "On waking" stacks.
      if (existingStacks.has(normalizeName(routine.name))) return;
      const members = routinePresets(routine, presets);
      if (members.length < 2) return;
      const byName = new Map(habits.map((h) => [normalizeName(h.name), h]));
      const missing = members.filter((p) => !byName.has(normalizeName(p.name)));
      const created = missing.length > 0 ? await createHabits(missing.map(toCreate)) : [];
      if (created.length !== missing.length) return; // a create failed — error already shown
      for (const h of created) byName.set(normalizeName(h.name), h);
      const orderedIds: string[] = [];
      for (const p of members) {
        const h = byName.get(normalizeName(p.name));
        if (h) orderedIds.push(h.id);
      }
      if (orderedIds.length < 2) return;
      const stackId = await createStack(routine.name, orderedIds);
      if (!stackId) return;
      toast.show(`Added “${routine.name}” — ${orderedIds.length} habits`, 'success', {
        label: 'Undo',
        onPress: () => {
          void deleteStack(stackId);
          for (const h of created) void deleteHabit(h.id);
        },
      });
    },
    [habits, presets, existingStacks, createHabits, createStack, deleteStack, deleteHabit, toast],
  );

  // Add the starter set — same pattern: multi-add lands off-screen, so confirm with an Undo
  // that deletes exactly the habits this tap created.
  const addStarterSet = useCallback(async () => {
    const created = await createHabits(starterRemaining.map(toCreate));
    if (created.length === 0) return;
    toast.show(`Added ${created.length} essential${created.length === 1 ? '' : 's'}`, 'success', {
      label: 'Undo',
      onPress: () => {
        for (const h of created) void deleteHabit(h.id);
      },
    });
  }, [starterRemaining, createHabits, deleteHabit, toast]);

  const goCreateHabit = () => router.push({ pathname: '/habits/editor', params: { id: 'new' } });

  const renderRow = ({ item, index }: ListRenderItemInfo<Row>) => {
    // Every cell shares the side gutters; the first also restores the breathing room the
    // sticky chips bar can't carry below its own hairline.
    const wrap = [styles.rowWrap, index === 0 && styles.firstRow];
    switch (item.type) {
      case 'banner':
        // Add failures (network) surface here, at the point of action — otherwise the
        // optimistic ✓ just reverts and the only message would appear back on the Habits list.
        return (
          <View style={wrap}>
            <ErrorBanner message={error} onDismiss={dismissError} />
          </View>
        );
      case 'empty':
        return (
          <View style={wrap}>
            <EmptyState
              icon="searchOff"
              title={`No matches for “${query.trim()}”`}
              body="Try another word, or create your own.">
              <AppButton
                variant="secondary"
                onPress={goCreateHabit}
                accessibilityLabel="Create your own habit">
                Create your own
              </AppButton>
            </EmptyState>
          </View>
        );
      case 'results':
        return (
          <View style={wrap}>
            <SettingsSection title={`${resultCount} result${resultCount === 1 ? '' : 's'}`}>
              {visibleRoutines.map((routine) => (
                <SunnahRoutineRow
                  key={routine.id}
                  routine={routine}
                  added={existingStacks.has(normalizeName(routine.name))}
                  onAdd={() => void addRoutine(routine)}
                  onRemove={() => removeRoutine(routine)}
                />
              ))}
              {flatPresets.map((preset) => (
                <SunnahPresetRow
                  key={preset.id}
                  preset={preset}
                  added={existing.has(normalizeName(preset.name))}
                  onAdd={() => void createHabit(toCreate(preset))}
                  onRemove={() => removePreset(preset)}
                />
              ))}
            </SettingsSection>
          </View>
        );
      case 'starter':
        // One-tap starter set for a new user — only in the default browse view.
        return (
          <View style={wrap}>
            <Surface padded pattern contentStyle={[styles.starter, { backgroundColor: theme.accentSubtle }]}>
              <ThemedText type="smallBold" themeColor="accent">
                New here? Start with the essentials
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                The moments already in your day: prayer times, morning and evening adhkār, and a
                daily page of Qurʾān.
              </ThemedText>
              <AppButton
                onPress={() => void addStarterSet()}
                accessibilityLabel={`Add starter set of ${starterRemaining.length} habits`}
                style={styles.starterButton}>
                Add starter set ({starterRemaining.length})
              </AppButton>
            </Surface>
          </View>
        );
      case 'routines':
        // Routines — ready-made stacks of habits that belong together as a sequence.
        return (
          <View style={wrap}>
            <SettingsSection title="Routines" footer="You still complete each habit on its own.">
              {visibleRoutines.map((routine) => (
                <SunnahRoutineRow
                  key={routine.id}
                  routine={routine}
                  added={existingStacks.has(normalizeName(routine.name))}
                  onAdd={() => void addRoutine(routine)}
                  onRemove={() => removeRoutine(routine)}
                />
              ))}
            </SettingsSection>
          </View>
        );
      case 'category':
        return (
          <View style={wrap}>
            <SettingsSection title={item.category.title}>
              {item.presets.map((preset) => (
                <SunnahPresetRow
                  key={preset.id}
                  preset={preset}
                  added={existing.has(normalizeName(preset.name))}
                  onAdd={() => void createHabit(toCreate(preset))}
                  onRemove={() => removePreset(preset)}
                />
              ))}
            </SettingsSection>
          </View>
        );
      case 'create':
        // Manual entry, surfaced as a fallback once the curated library has had its say
        // (flexibility-after-failure); the header + offers it persistently too. Routines aren't
        // built here — you make one on Today by dropping one habit onto another (or the swipe
        // "Add to routine → New routine"), so this stays a single, focused habit-create door.
        return (
          <View style={wrap}>
            <SettingsSection title="Can't find it?">
              <SettingsRow
                icon="add"
                label="Create your own habit"
                showChevron
                accessibilityLabel="Create your own habit"
                onPress={goCreateHabit}
              />
            </SettingsSection>
          </View>
        );
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Standard header — the centered "Add Habit" title (set on the route) is enough. No
          header +: this screen IS the add screen, and a second + one tap after the one that
          opened it read as the same glyph meaning something new. Manual entry lives in the
          "Can't find it?" section at the foot of every browse view and in the empty-search CTA. */}

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

      {/* The faint lunar sky sits fixed behind the transparent list (the same layering the
          Habits tab uses) — in-scroll it would just scroll away with the first section. */}
      <GeometricBackdrop variant="screen" />

      {/* Filter chips are the list's sticky header — still pinned under the native search bar
          for findability, and a descendant of the single tracked scroll (an outside-the-scroll
          sibling would sit un-inset at the screen's true top and get flashed over the header by
          react-native-screens on the back-swipe). The route's centered "Add Habit" is the title. */}
      <FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[0]}
        ListHeaderComponent={
          <View style={[styles.controls, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
            <DiscoverFilterChips filters={filters} active={filter} onChange={setFilter} />
          </View>
        }
        ItemSeparatorComponent={SectionGap}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Transparent over the fixed sky; the section cards are opaque surfaces on top of it.
  list: { flex: 1, backgroundColor: 'transparent' },
  listContent: {
    paddingBottom: BottomTabInset + Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  // Tight on purpose — this library stacks many short category cards, and the default screen
  // gap read as a lot of dead air between them.
  gap: { height: Spacing.two },
  rowWrap: { paddingHorizontal: Spacing.three },
  firstRow: { paddingTop: Spacing.two },
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
