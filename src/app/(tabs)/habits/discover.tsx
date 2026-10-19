import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, View, type ListRenderItemInfo } from 'react-native';

import { AppButton } from '@/components/app-button';
import { DiscoverFilterChips, type Filter } from '@/components/discover-filter-chips';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { GeometricBackdrop } from '@/components/ornament/geometric-backdrop';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { SunnahPresetRow } from '@/components/sunnah-preset-row';
import type { SunnahCategory, SunnahPreset } from '@/constants/sunnah-habits';
import { MaxContentWidth, ScrollBottomInset, Spacing } from '@/constants/theme';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useCatalog } from '@/hooks/use-catalog';
import { type Habit, useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/alerts';
import { habitInputFor as toCreate } from '@/lib/curated';
import { haptics } from '@/lib/haptics';
import { habitMetaLine } from '@/lib/loose-row';
import { normalizeName } from '@/lib/names';

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

/** Where a habit sits, by name: its stack (or none) plus its folded name. A name is unique only
 *  within one stack, so this — not the name alone — is what identifies the act a row stands for. */
const slot = (stackId: string | null, name: string) => `${stackId ?? ''}\u0000${normalizeName(name)}`;

const rowKey = (row: Row) => (row.type === 'category' ? `category-${row.category.id}` : row.type);

/** The air between sections — generous so each category reads as its own group (its heading
 * hugs its card from above, tighter than the gap to the section before). */
const SectionGap = () => <View style={styles.gap} />;

/**
 * Discover — a curated, evidence-backed library of SMART Sunnah habits. Search or filter to find
 * one fast, then add it with a single tap from the row (no need to expand first); expand a row to
 * read how it's tracked and its Sunnah source. The from-scratch path is one row at the head of the
 * list, as on "Add a stack" and "Add an exchange", and stays there while you search (on Android the
 * search view expands into the toolbar and takes the whole bar with it).
 *
 * A native modal sheet of the Habits Stack (from the bottom, like the editor), so it shares
 * `HabitsProvider`; a left-aligned Close dismisses it (set in the layout). The body is a
 * virtualized FlatList of section cards, so only visible sections mount.
 *
 * **It works two ways, and `stackId` is what picks between them.**
 *
 * *Scoped* (`stackId` — the empty card's "Add your first act", `⋯ Manage stack → Add acts`): the
 * screen composes one stack's sequence. A tap answers "in this stack?" rather than "exists?", so a
 * loose habit you already have moves in, one already in another stack is added here again under the
 * same name as its own row (never pulled out of it: reading Qurʾān after Fajr and after ʿIshāʾ are
 * two acts), and the ✓ tap un-members rather than deletes. A "Your habits" section
 * offers the lone habits you already have.
 *
 * *Unscoped* (`+ → Habit`): the same library, landing a **stackless habit** — the unit the HABITS
 * section on Today tracks. This is why the other two REPEATING doors in the add sheet open a
 * library and this one no longer opens a blank form: naming a habit from memory is recall where the
 * catalog offers recognition, and three doors in one sheet behaving two ways is the inconsistency
 * you feel before you can point at it. Here a tap answers "among your loose habits?" — the same
 * question as scoped, asked of the habits in no stack — and the ✓ deletes the loose one. A copy of
 * the preset inside a stack is another act and isn't this screen's to touch.
 *
 * (The unscoped branch existed before it was reachable, and `addPreset` opened with `if (!stack)
 * return` — while `ExpandableAddRow` fires its "added" haptic *before* delegating. The tap buzzed
 * like a success and did nothing. Anything added here that can decline must say so.)
 */
export default function DiscoverScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { stackId } = useLocalSearchParams<{ stackId?: string }>();
  const {
    habits,
    stacks,
    createHabits,
    createHabitInStack,
    moveHabit,
    deleteHabit,
    error,
    dismissError,
  } = useHabits();
  const { categories, presets } = useCatalog();

  const stack = stackId ? (stacks.find((s) => s.id === stackId) ?? null) : null;
  const scoped = stack !== null;
  // One word per thing, wherever it is read (the house rule): inside a stack a habit is an **act**,
  // one deed of a sequence; standing on its own it is a **habit**, which is what the section it
  // will land in is called and what the "+" card that opened this said.
  const noun = scoped ? 'act' : 'habit';

  // Scoped to a stack that no longer exists (deleted while this modal was up): back out.
  useBackIfStale(!!stackId && !stack);

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

  // The habit a preset row stands for: the one by that name in this screen's container — the
  // scoped stack, or the loose habits when unscoped. A name is only unique within a stack, so a
  // lookup across all habits would find whichever copy came last (the Fajr one, while composing
  // ʿIshāʾ) and the row would answer for the wrong act.
  const container = stack?.id ?? null;
  const habitBySlot = useMemo(() => new Map(habits.map((h) => [slot(h.stack_id, h.name), h])), [habits]);
  const habitIn = (stackId: string | null, preset: SunnahPreset) => habitBySlot.get(slot(stackId, preset.name));

  // What this visit actually created. The ✓ is documented as undoing "what it created" — but it
  // matched by NAME, so the same tap also reached a habit kept for months and deleted it, and
  // `habit_completions` cascades: one tap on a row's title, and a year of ticks is gone with no
  // confirmation and nothing to undo. (Found by tapping one by accident during a QA pass.) The act's
  // own sheet has asked "Its history goes with it." all along; the library was the way around it.
  //
  // A ref, not state: nothing renders from it, and re-rendering the whole catalog to record an id
  // would be the expensive half of a bookkeeping detail.
  const createdHere = useRef<Set<string>>(new Set());

  // A row is "added" when its habit is in this screen's container — scoped, a member of THIS
  // stack; unscoped, one of the loose habits. A copy elsewhere is a different act.
  const addedFor = (preset: SunnahPreset) => habitIn(container, preset) !== undefined;

  const addPreset = (preset: SunnahPreset) => {
    if (habitIn(container, preset)) return; // already here (the ✓ tap handles removal)
    if (!stack) {
      // Unscoped: land it as a stackless habit, straight into Today's HABITS section. `toCreate`
      // names no stack at all, which is what made this the three-line change it looks like.
      void createHabits([toCreate(preset)]).then(([created]) => {
        if (created) createdHere.current.add(created.id);
      });
      return;
    }
    const loose = habitIn(null, preset);
    if (loose) {
      // An un-anchored habit you already have — give it this home. Non-destructive: it wasn't in a
      // stack, so nothing gets quietly emptied.
      void moveHabit(loose.id, { toStackId: stack.id });
      return;
    }
    // Not here yet — create it straight into this stack, under the preset's own name, even when
    // another stack already holds it. Each is its own row with its own ticks, so filling this stack
    // never silently empties another.
    void createHabitInStack(toCreate(preset), stack.id);
  };

  const removePreset = (preset: SunnahPreset) => {
    const habit = habitIn(container, preset);
    if (!habit) return;
    if (stack) {
      // Scoped: un-member, never delete. This screen composes a stack's sequence; destroying an act
      // (and the history that cascades with it) belongs to the act's own sheet, where the
      // confirmation is. Un-anchored, it lands in Today's HABITS section rather than vanishing.
      void moveHabit(habit.id, { toStackId: null, keepEmptyShell: true });
      return;
    }
    // Undoing an add you just made is instant — that is the checklist idiom this row is built on,
    // and there is nothing yet to lose. Reaching anything older is a deletion, not an undo, so it
    // asks in the same words the act's own sheet does. Same destruction either way; the difference
    // is whether the tap can cost you something you didn't come here to spend.
    if (createdHere.current.has(habit.id)) {
      createdHere.current.delete(habit.id);
      void deleteHabit(habit.id);
      return;
    }
    confirmDestructive({
      title: 'Delete habit',
      message: `Delete “${habit.name}”? Its history goes with it.`,
      onConfirm: () => void deleteHabit(habit.id),
    });
  };

  // Search and category cards share the same actions and accessibility contract.
  const renderPreset = (preset: SunnahPreset) => {
    const addedHint = stack
      ? 'Removes it from this stack and keeps it in your habits'
      : 'Removes this habit; asks before deleting saved history';
    return (
      <SunnahPresetRow
        key={preset.id}
        preset={preset}
        added={addedFor(preset)}
        onAdd={() => addPreset(preset)}
        onRemove={() => removePreset(preset)}
        addHint={stack ? 'Adds it to this stack' : 'Adds it to your habits'}
        addedHint={addedHint}
      />
    );
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
          // One this stack already holds by name would land as a second identical row — `moveHabit`
          // refuses that move, so it isn't offered.
          !habitBySlot.has(slot(container, h.name)) &&
          (!searching || h.name.toLowerCase().includes(q)),
      )
    : [];

  // The virtualized list's data: one row per section card. The error banner is a row too
  // (only when there is an error, so no phantom cell + separator when there isn't).
  // No manual memo — the React Compiler caches this (and `renderRow` below) by its inputs.
  const rows: Row[] = [];
  if (error) rows.push({ type: 'banner' });
  // A search that found nothing at all shows the empty state, which offers the same door as its
  // own button; everywhere else the from-scratch row leads, as it does on "Add a stack" and "Add
  // an exchange". Leading, it is also on screen while you type: Android's SearchView expands INTO
  // the toolbar, so the bar holds nothing but the field and a nav-bar door would be gone.
  const emptySearch = searching && resultCount === 0 && loneHabits.length === 0;
  if (!emptySearch) rows.push({ type: 'create' });
  // Scoped: what you already have comes next — pulling an existing habit in beats creating a twin.
  if (loneHabits.length > 0) rows.push({ type: 'yourHabits', habits: loneHabits });
  if (searching) {
    if (resultCount > 0) rows.push({ type: 'results' });
    else if (emptySearch) rows.push({ type: 'empty' });
  } else {
    for (const section of categorySections) rows.push({ type: 'category', ...section });
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
                accessibilityLabel={`Create your own ${noun}`}>
                {`Create your own ${noun}`}
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
              {flatPresets.map(renderPreset)}
            </SettingsSection>
          </View>
        );
      case 'yourHabits':
        // Scoped only: lone habits you already have — one tap pulls one into the stack. The
        // row leaving this section (it's a member now) is the confirmation, like a preset ✓.
        return (
          <View style={wrap}>
            <SettingsSection title="Your habits">
              {item.habits.map((habit) => (
                <SettingsRow
                  key={habit.id}
                  icon="add"
                  label={habit.name}
                  sublabel={habitMetaLine({
                    targetCount: habit.target_count,
                    targetUnit: habit.target_unit,
                    scheduleDays: habit.schedule_days,
                    hijriSchedule: habit.hijri_schedule,
                  })}
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
        // The app's one section caption — `SettingsSection`'s own `SectionLabel`, the one the stack
        // and exchange libraries use for the very same job — and Settings, and the day. This screen
        // was the single place that reached for an 18pt `heading` instead, on the argument that a
        // long library needs a stronger marker to walk by; but the two sibling libraries reached
        // from the same + menu are no shorter, and this is the only one of the three that ALSO has
        // filter chips pinned at its head. One idiom, and the wayfinding it was traded for is
        // already on the screen.
        return (
          <View style={wrap}>
            <SettingsSection title={item.category.title}>
              {item.presets.map(renderPreset)}
            </SettingsSection>
          </View>
        );
      case 'create':
        // The from-scratch door, one row at the head of the list. In scoped mode the editor
        // inherits the stack, so a custom act lands inside it too; unscoped it lands stackless,
        // the same place a preset tapped here does. Scoped, its caption is also where the screen
        // says which stack everything here goes into: the nav-bar title used to ("Add to Waking
        // up, for the body"), and a stack name of any length broke it onto two lines between
        // Close and Custom.
        return (
          <View style={wrap}>
            <SettingsSection title={stack ? `Adding to ${stack.name}` : undefined}>
              <SettingsRow
                icon="add"
                label={`Your own ${noun}`}
                sublabel="Name, target and schedule"
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
      {/* A short, fixed title opposite the route's Close, and nothing on the right: a modal's title
          has to fit between its bar buttons, so it never carries user text. The stack being added
          to is named at the head of the list instead (the `create` row's caption). */}
      <Stack.Screen options={{ title: scoped ? 'Add an act' : 'Add a habit' }} />

      {/* The search field is the native nav-bar search (UISearchController on iOS / the
          SearchView on Android), not an in-body input — a true platform search experience.
          `hideWhenScrolling` is off so findability stays pinned for this ~60-item library;
          its own clear (✕) and Cancel replace the custom ones. */}
      <Stack.SearchBar
        placeholder={`Search Sunnah ${noun}s`}
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
          top under that same header. The title is the screen's own ("Add a habit"). */}
      <FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={rowKey}
        // A cell is a whole category card. The default ten-cell batch mounts the entire
        // catalog; render one card at a time and keep only nearby screens mounted.
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
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
    paddingBottom: ScrollBottomInset + Spacing.four,
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
});
