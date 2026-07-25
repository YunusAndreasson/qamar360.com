import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import { AppButton } from '@/components/app-button';
import { DiscoverFilterChips, type Filter } from '@/components/discover-filter-chips';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { SunnahPresetRow } from '@/components/sunnah-preset-row';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { isRepeatablePreset, scheduleSummary, type SunnahCategory, type SunnahPreset } from '@/constants/sunnah-habits';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { type Habit, useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { habitInputFor as toCreate } from '@/lib/curated';
import { haptics } from '@/lib/haptics';
import { dedupeName, normalizeName } from '@/lib/names';

/** 'all' | a category id — the active chip narrows the corpus searched. */
type FilterId = 'all' | SunnahCategory['id'];

/**
 * One virtualized row of the library — a whole section card (or the banner / empty state), so
 * the grouped-card design survives windowing: a card is never split across cells, and only the
 * on-screen sections mount instead of the full ~60-row library.
 */
type Row =
  | { type: 'banner' }
  | { type: 'empty' }
  | { type: 'results' }
  | { type: 'yourHabits'; habits: Habit[] }
  | { type: 'category'; category: SunnahCategory; presets: SunnahPreset[] }
  | { type: 'create' };

const rowKey = (row: Row) => (row.type === 'category' ? `category-${row.category.id}` : row.type);

/** The air between sections — generous so each category reads as its own group (its heading
 * hugs its card from above, tighter than the gap to the section before). */
const SectionGap = () => <View style={styles.gap} />;

/**
 * Discover — a curated, evidence-backed library of SMART Sunnah habits. Search or filter to
 * find one fast, then add it with a single tap from the row (no need to expand first); once
 * added, a trailing ＋ adds another independent copy — for a habit you keep in more than one
 * place (a page of Qurʾān in both Morning and Evening). Expand to read how it's tracked and its
 * Sunnah source. The library leads: the starter set for new
 * users, then the categories; "Create your own" closes the list as a quiet row for the rarer
 * from-scratch path. A native modal sheet of the Habits Stack (from the bottom, like the
 * editor), so it shares `HabitsProvider`; a left-aligned Close dismisses it (set in the
 * layout). The body is a virtualized FlatList of section cards, so only visible sections mount.
 *
 * With a `stackId` param (the empty card's "Add your first habit" and the ⋯ menu's "Add
 * habits") the same screen adds *into* that stack: the title says so, rows answer "in this
 * stack?" rather than "exists?", adds land as members (a loose habit you already have moves in;
 * one already in another stack is copied here as its own row, never pulled out of it), the ✓ tap
 * un-members rather than deletes, and a "Your habits" section offers the lone habits you already
 * have.
 */
export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { stackId } = useLocalSearchParams<{ stackId?: string }>();
  const {
    habits,
    stacks,
    createHabits,
    createHabitInStack,
    moveHabit,
    error,
    dismissError,
  } = useHabits();
  const { categories, presets } = useCatalog();

  const stack = stackId ? (stacks.find((s) => s.id === stackId) ?? null) : null;
  const scoped = stack !== null;

  // Scoped to a stack that no longer exists (deleted while this modal was up): back out.
  useEffect(() => {
    if (stackId && !stack) router.back();
  }, [stackId, stack, router]);

  // All → one chip per category, from the live category list.
  const filters: Filter[] = [
    { id: 'all', label: 'All' },
    ...categories.map((c) => ({ id: c.id, label: c.title })),
  ];

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  // Defer the term that drives filtering so the section list doesn't rebuild on every
  // keystroke — the native search field still tracks `query` instantly.
  const deferred = useDeferredValue(query);
  const q = deferred.trim().toLowerCase();
  const searching = q.length > 0;

  // Normalized name → habit, so a row can both answer "already added?" and undo its own add
  // by deleting the exact habit it created (the ✓ becomes tap-to-remove).
  const habitByName = useMemo(() => new Map(habits.map((h) => [normalizeName(h.name), h])), [habits]);
  const existing = useMemo(() => new Set(habitByName.keys()), [habitByName]);

  // Scoped: a row is "added" only when its habit is a member of THIS stack — the surface
  // manages membership; the plain screen manages existence.
  const addedFor = (preset: SunnahPreset) => {
    const habit = habitByName.get(normalizeName(preset.name));
    return scoped ? habit?.stack_id === stack.id : habit !== undefined;
  };

  // Copy a preset into the scoped stack as a fresh, independent row — used when the same habit
  // already lives in another stack, so we add a second one here instead of moving the original
  // out. Mirrors "Add another": the copy takes the next free "… 2"/"… 3" name, and the toast
  // offers a one-tap rename.
  const addCopyIntoStack = async (preset: SunnahPreset, targetStackId: string) => {
    const name = dedupeName(preset.name, existing);
    const [created] = await createHabits([{ ...toCreate(preset), name }]);
    if (!created) return; // createHabits already surfaced the error
    await moveHabit(created.id, { toStackId: targetStackId, placement: { type: 'member-append' } });
    toast.show(`Added another “${preset.name}”`, 'success', {
      label: 'Rename',
      onPress: () => router.push({ pathname: '/habits/editor', params: { id: created.id } }),
    });
  };

  const addPreset = (preset: SunnahPreset) => {
    if (!scoped) {
      // Unscoped, an act has no home yet: ask which stack it joins rather than mint an orphan.
      // (The picker can also start a new stack, so "none of these" is still a way forward.)
      router.push({ pathname: '/habits/add-to-stack', params: { presetId: preset.id } });
      return;
    }
    const found = habitByName.get(normalizeName(preset.name));
    if (!found) {
      // Not a habit anywhere yet — create it straight into this stack.
      void createHabitInStack(toCreate(preset), stack.id);
      return;
    }
    if (found.stack_id === stack.id) return; // already a member here (the ✓ tap handles removal)
    if (found.stack_id === null) {
      // An un-anchored habit you already have (from before every habit had a stack) — give it
      // this home. Non-destructive: it wasn't in a stack, so nothing gets quietly emptied.
      void moveHabit(found.id, { toStackId: stack.id });
      return;
    }
    // It already lives in another stack: add an independent copy here rather than pull the
    // original out of that stack. Each copy is its own row (the app's model, and the ＋ "Add
    // another"), so filling this stack never silently empties another.
    void addCopyIntoStack(preset, stack.id);
  };

  // Un-member, never delete. This screen composes a stack's sequence; destroying an act (and the
  // history that cascades with it) belongs to the act's own sheet, where the confirmation is.
  // Un-anchored, the act lands in the one-time "Anchor these" card on Today rather than vanishing.
  const removePreset = (preset: SunnahPreset) => {
    const habit = habitByName.get(normalizeName(preset.name));
    if (!habit) return;
    void moveHabit(habit.id, { toStackId: null, keepEmptyShell: true });
  };

  // "Add another" (the trailing ＋ on an already-added row): a second, independent copy for a
  // habit you want in more than one place — a page of Qurʾān in both Morning and Evening. Names
  // carry the app's habit identity (the editors reject a collision), so the copy takes the next
  // free "… 2"/"… 3" — distinct on Today, and one tap from a rename via the toast. Plain screen
  // only: inside a stack the same tap means "put the existing one in this stack".
  const addAnother = async (preset: SunnahPreset) => {
    const name = dedupeName(preset.name, existing);
    const [created] = await createHabits([{ ...toCreate(preset), name }]);
    if (!created) return; // createHabits already surfaced the error
    toast.show(`Added another “${preset.name}”`, 'success', {
      label: 'Rename',
      onPress: () => router.push({ pathname: '/habits/editor', params: { id: created.id } }),
    });
  };

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
  const resultCount = flatPresets.length;

  // Scoped: the user's lone habits (in no stack), one tap from joining this one. Habits whose
  // name matches a library preset are left to their preset row (same tap, no double listing),
  // so this section is effectively their custom habits. Search-filtered like the presets.
  const presetNames = useMemo(() => new Set(presets.map((p) => normalizeName(p.name))), [presets]);
  const loneHabits = scoped
    ? habits.filter(
        (h) =>
          h.stack_id === null &&
          !presetNames.has(normalizeName(h.name)) &&
          (!searching || h.name.toLowerCase().includes(q)),
      )
    : [];

  // The virtualized list's data: one row per section card. The error banner is a row too
  // (only when there is an error, so no phantom cell + separator when there isn't).
  // No manual memo — the React Compiler caches this (and `renderRow` below) by its inputs.
  const rows: Row[] = [];
  if (error) rows.push({ type: 'banner' });
  // Scoped: what you already have leads — pulling an existing habit in beats creating a twin.
  if (loneHabits.length > 0) rows.push({ type: 'yourHabits', habits: loneHabits });
  if (searching) {
    if (resultCount > 0) rows.push({ type: 'results' });
    else if (loneHabits.length === 0) rows.push({ type: 'empty' });
  } else {
    // Library-first: the curated Sunnah habits are why this screen exists, so they lead —
    // the starter set for a fresh account, then the categories. Create-your-own closes the
    // list as a quiet row: the from-scratch path stays one tap away without shouting over
    // the library (and the empty-search state offers it too). The starter belongs to the
    // plain screen only — inside a stack it would add habits *outside* it.
    for (const section of categorySections) rows.push({ type: 'category', ...section });
    rows.push({ type: 'create' });
  }

  const goCreateHabit = () =>
    router.push({
      pathname: '/habits/editor',
      params: stack ? { id: 'new', stackId: stack.id } : { id: 'new' },
    });

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
              body={'Try another word, or create your own.'}>
              <AppButton
                variant="secondary"
                onPress={goCreateHabit}
                accessibilityLabel="Create your own act">
                Create your own
              </AppButton>
            </EmptyState>
          </View>
        );
      case 'results':
        // Search flattens the categories into one card; the overline is a meta count, not a
        // section, so it keeps the quiet label treatment.
        return (
          <View style={wrap}>
            <SettingsSection title={`${resultCount} result${resultCount === 1 ? '' : 's'}`}>
              {flatPresets.map((preset) => (
                <SunnahPresetRow
                  key={preset.id}
                  preset={preset}
                  added={addedFor(preset)}
                  onAdd={() => addPreset(preset)}
                  onRemove={() => removePreset(preset)}
                  onAddAnother={scoped || !isRepeatablePreset(preset) ? undefined : () => void addAnother(preset)}
                />
              ))}
            </SettingsSection>
          </View>
        );
      case 'yourHabits':
        // Scoped only: lone habits you already have — one tap pulls one into the stack. The
        // row leaving this section (it's a member now) is the confirmation, like a preset ✓.
        return (
          <View style={wrap}>
            <SettingsSection title="Your acts">
              {item.habits.map((habit) => (
                <SettingsRow
                  key={habit.id}
                  icon="add"
                  label={habit.name}
                  sublabel={scheduleSummary(habit.schedule_days, habit.hijri_schedule)}
                  onPress={() => {
                    if (!stack) return;
                    haptics.added();
                    void moveHabit(habit.id, { toStackId: stack.id });
                  }}
                />
              ))}
            </SettingsSection>
          </View>
        );
      case 'category':
        // A real heading (not the 14pt overline) so the eye can walk the library by section;
        // it sits tight above its own card — closer to what it names than to what precedes it.
        return (
          <View style={wrap}>
            <View style={styles.section}>
              <ThemedText type="heading" style={styles.sectionTitle}>
                {item.category.title}
              </ThemedText>
              <SettingsSection>
                {item.presets.map((preset) => (
                  <SunnahPresetRow
                    key={preset.id}
                    preset={preset}
                    added={addedFor(preset)}
                    onAdd={() => addPreset(preset)}
                    onRemove={() => removePreset(preset)}
                    onAddAnother={scoped || !isRepeatablePreset(preset) ? undefined : () => void addAnother(preset)}
                  />
                ))}
              </SettingsSection>
            </View>
          </View>
        );
      case 'create':
        // The from-scratch door, deliberately last and quiet: the library above is the primary
        // offer. In scoped mode the editor inherits the stack, so a custom habit lands inside
        // it too. (Stacks themselves are made from the + menu, or by dropping one habit onto
        // another on Today.)
        return (
          <View style={wrap}>
            <SettingsSection>
              <SettingsRow
                icon="add"
                label="Create your own act"
                sublabel="Name, schedule and goal"
                onPress={goCreateHabit}
                showChevron
              />
            </SettingsSection>
          </View>
        );
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Standard header — the centered title (set on the route, overridden per-stack here) is
          enough. No header +: this screen IS the add screen, and a second + one tap after the
          one that opened it read as the same glyph meaning something new. The library leads the
          body; the empty-search state and the closing row both offer create-your-own. */}
      {stack ? <Stack.Screen options={{ title: `Add to ${stack.name}` }} /> : null}

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

      {/* Filter chips lead the list as its (scrolling) header — deliberately NOT sticky. On this
          native modal react-native-screens gives the content a zero header offset (RNSScreen.mm's
          isPresentedAsNativeModal branch) and the layout leans entirely on the automatic content
          inset — which RN's sticky-header math never sees (ScrollView.js only offsets by the
          contentInset PROP), so a sticky row engaged one bar-height too late and vanished under
          the opaque header the moment the list scrolled. Letting the chips scroll with the
          content is the native filter-row idiom (they're one flick from anywhere), and the always-
          visible search bar carries pinned findability. They stay a descendant of the single
          tracked scroll — an outside-the-scroll sibling would sit un-inset at the screen's true
          top under that same header. The route's centered "Add Habit" is the title. */}
      <FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.controls}>
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
  // Generous between sections so each group reads as one unit (proximity does the work the
  // old uniform 8px column couldn't); within a section everything stays tight.
  gap: { height: Spacing.four },
  rowWrap: { paddingHorizontal: Spacing.three },
  firstRow: { paddingTop: Spacing.three },
  // In-flow now (not sticky), so no opaque background or seam hairline — the chips sit on the
  // sky like the section content beneath them.
  controls: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    gap: Spacing.two,
  },
  // A category: its heading hugs the card it names (the inter-section gap above provides the
  // separation from the previous group).
  section: { gap: Spacing.two },
  sectionTitle: { marginLeft: Spacing.one },
});
