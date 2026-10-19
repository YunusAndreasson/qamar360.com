import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { GuideIntro } from '@/components/guide-intro';
import { LibraryCard } from '@/components/library-card';
import { SectionLabel } from '@/components/section-label';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { CURATED_GROUPS, type CuratedStack } from '@/constants/curated-stacks';
import { STACKING_GUIDE } from '@/constants/guides';
import { Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useHabits } from '@/hooks/use-habits';
import { countGoalLabel } from '@/lib/count-goal';
import { buildCuratedPlan } from '@/lib/curated';
import { haptics } from '@/lib/haptics';
import { MOMENTS } from '@/lib/moments';

/**
 * Add a stack: your own, or one of the ready-made ones.
 *
 * This is the app's front door for a new user, and the reason the first-run empty state asks for
 * an *anchor* rather than a habit: a sequence hung on something you already do every day survives,
 * and a Muslim day is unusually rich in such anchors. Each card shows the moment and the exact acts
 * you'd be taking on, so the decision is made with the whole thing visible, not after committing.
 *
 * The page reads top to bottom as one decision: what a stack is (one line), your own (one row),
 * then the ready-made ones by moment. It used to open on the argument, bury the from-scratch door
 * in the nav bar and again below eleven cards, and give each card three tiers of grey prose over a
 * full-width button whose label changed from card to card. The name now leads each card, the acts
 * follow quietly, and every card's verb is the same "Add".
 *
 * Adding is idempotent by design: acts already owned are skipped and a same-named stack is
 * appended to, so re-running a partly-added stack only fills the gaps.
 */
export default function StackLibraryScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { presets } = useCatalog();
  const { habits, stacks, createHabits, createStack, updateStack, deleteStack, deleteHabit, moveHabit } = useHabits();

  // The from-scratch door, offered once, ahead of the ready-made cards. `push`, as Discover pushes
  // its editor: Cancel on the blank form steps back here (the "+" sheet it once returned to was
  // already replaced away, so `replace` dropped you on Today), while Create closes the whole flow
  // onto the day.
  const goCreateStack = () => router.push('/habits/stack-new');

  // The card being added, while its writes are in flight. A plan is read off the habits as they
  // stand, so a second tap before the first landed planned the same acts again and made them twice.
  // State draws the busy pill; the ref is the guard, since two taps can land before a re-render.
  const [adding, setAdding] = useState<string | null>(null);
  const addingRef = useRef(false);
  const add = async (curated: CuratedStack) => {
    if (addingRef.current) return;
    addingRef.current = true;
    setAdding(curated.id);
    try {
      await addStack(curated);
    } finally {
      addingRef.current = false;
      setAdding(null);
    }
  };

  const addStack = async (curated: CuratedStack) => {
    const plan = buildCuratedPlan(curated, presets, habits, stacks);
    if (!plan) return; // the stack exists and already holds every act — the card reads as added
    // Where each gathered act sits right now, read before anything moves: Undo owes the acts the
    // user already kept the same restoration as the ones this created.
    const gatheredFrom = new Map(
      plan.gatherIds.map((id) => [id, habits.find((h) => h.id === id)?.stack_id ?? null] as const),
    );

    const created = await createHabits(plan.inputs);
    // Empty is the answer to an empty ask (a stack built only out of acts already kept), so only
    // an ask that came back with nothing is a failure — and createHabits has already said so.
    if (plan.inputs.length > 0 && created.length === 0) return;
    if (created.length > 0) haptics.added();

    // The membership in the stack's own sequence — the order the card numbers 1..n, and the order
    // the acts are actually done in. An act already kept answers with its own id; a new one takes
    // the next of the rows just created.
    const pending = [...created];
    const ids = plan.acts
      .map((act) => (act.kind === 'own' ? act.habitId : pending.shift()?.id))
      .filter((id): id is string => id !== undefined);

    let createdStackId: string | null = null;
    if (plan.existingStackId) {
      // Append to the user's own same-named stack, keeping the members it already had — minus any
      // this plan is about to re-seat — ahead of the curated sequence.
      const planned = new Set(ids);
      const current = habits
        .filter((h) => h.stack_id === plan.existingStackId && !planned.has(h.id))
        .sort((a, b) => a.position - b.position)
        .map((h) => h.id);
      await updateStack(plan.existingStackId, { orderedMemberIds: [...current, ...ids] });
    } else {
      createdStackId = await createStack(plan.name, ids, { moment: plan.moment });
      // The stack is the whole point of this screen, so an anchoring that couldn't anchor undoes
      // itself rather than leaving its acts behind. Half-applied was the worst of the three
      // outcomes: the acts landed loose at the end of Today, and the card — which reads "already
      // owned" off habit names alone — went quiet and offered no way to retry. (Found the day
      // `duha` reached a CHECK constraint that had never heard of it.) `createStack` has already
      // surfaced the failure; the success toast below would otherwise report the opposite.
      if (!createdStackId) {
        for (const habit of created) void deleteHabit(habit.id);
        return;
      }
    }

    show(`Added ${plan.name} to Today`, 'success', {
      label: 'Undo',
      onPress: () => {
        void (async () => {
          // Shell first, then acts: deleting the acts first would trip the stack's empty-shell
          // sweep against a ref that hasn't seen the previous delete yet, and could strand a shell
          // that now renders as an empty card. Awaited in turn for the same reason — each step
          // reads the arrangement the one before it left.
          if (createdStackId) await deleteStack(createdStackId);
          // A gathered act goes back where it came from, not merely loose.
          for (const [habitId, from] of gatheredFrom) await moveHabit(habitId, { toStackId: from });
          for (const habit of created) await deleteHabit(habit.id);
        })();
      },
    });
  };

  return (
    <AppScreen contentStyle={styles.content}>
      {/* What a stack is, in one line, with the argument one tap down. */}
      <GuideIntro guide={STACKING_GUIDE} />

      {/* Your own first, the way a template gallery leads with the blank page: someone who came
          knowing what they want shouldn't have to scroll past eleven suggestions to find it. One
          row, so it costs the browsing reader a glance. */}
      <SettingsSection>
        <SettingsRow
          icon="add"
          label="Your own stack"
          sublabel="Choose a moment, then add your acts"
          onPress={goCreateStack}
          showChevron
        />
      </SettingsSection>

      {CURATED_GROUPS.map((group) => (
        <View key={group.key} style={styles.group}>
          <SectionLabel>{group.title}</SectionLabel>
          {group.stacks.map((curated) => (
            <CuratedCard
              key={curated.id}
              curated={curated}
              // Null only once the stack exists AND holds every act — owning the acts alone
              // leaves the card something to offer: the anchoring itself.
              plan={buildCuratedPlan(curated, presets, habits, stacks)}
              busy={adding === curated.id}
              onAdd={() => void add(curated)}
            />
          ))}
        </View>
      ))}
    </AppScreen>
  );
}

/**
 * One ready-made stack, shown whole: its name, then the acts in the order
 * they're done. Acts the user already keeps are listed like the rest (the sequence is the thing
 * being learned, so it is always shown complete); adding gathers them in rather than duplicating
 * them, and the accessibility hint says so.
 *
 * Each card used to carry a line on why its cue holds, and a button that named one of three
 * offers ("Add this stack", "Add the missing 2", "Anchor the acts you keep"). The line was a third
 * tier of grey between the name and the acts, read once if ever; the three labels made the same
 * tap look like three different things. The difference they named is real but small, and Undo
 * reverses all of it.
 */
function CuratedCard({
  curated,
  plan,
  busy,
  onAdd,
}: {
  curated: CuratedStack;
  plan: ReturnType<typeof buildCuratedPlan>;
  busy: boolean;
  onAdd: () => void;
}) {
  const { presets } = useCatalog();
  const byId = new Map(presets.map((p) => [p.id, p]));
  // Each act as it will read on Today: a counted one carries its measure ("Drank water · 8 cups"),
  // so the card says what the stack asks of a day before it is added.
  const acts = curated.acts
    .map((a) => byId.get(a.presetId))
    .filter((p) => p !== undefined)
    .map((p) => (p.targetCount ? `${p.name} · ${countGoalLabel(p.targetCount, p.targetUnit)}` : p.name));
  const adding = plan?.inputs.length ?? 0;
  const gathering = plan?.gatherIds.length ?? 0;
  const moment = MOMENTS[curated.moment];

  const said: string[] = [];
  if (adding > 0) said.push(`Adds ${adding} act${adding === 1 ? '' : 's'}`);
  if (gathering > 0)
    said.push(`${said.length > 0 ? 'gathers' : 'Gathers'} ${gathering} act${gathering === 1 ? '' : 's'} you already keep`);
  const hint = `${said.join(', ')}, anchored to ${moment.label}.`;

  return (
    <LibraryCard
      title={curated.name}
      owned={plan === null}
      action={{ onPress: onAdd, busy, accessibilityLabel: `Add the ${curated.name} stack`, accessibilityHint: hint }}>
      <View style={styles.acts} accessible accessibilityLabel={`Acts: ${acts.join(', ')}`}>
        {acts.map((name) => (
          <ThemedText key={name} type="small" themeColor="textSecondary">
            {name}
          </ThemedText>
        ))}
      </View>
    </LibraryCard>
  );
}

const styles = StyleSheet.create({
  // 24 between groups — the step Settings and Discover keep between their sections.
  content: { gap: Spacing.four },
  // 8 from a caption to its first card and between cards: the app's caption→card beat.
  group: { gap: Spacing.two },
  // The sequence, one act a line, so it reads as a list to learn rather than body copy.
  acts: { gap: Spacing.half },
});
