import { Stack, useRouter } from 'expo-router';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { AppScreen } from '@/components/app-screen';
import { headerNewAction } from '@/components/form-header-actions';
import { GuideIntro } from '@/components/guide-intro';
import { SectionLabel } from '@/components/section-label';
import { SettingsRow } from '@/components/settings-row';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { CURATED_GROUPS, type CuratedStack } from '@/constants/curated-stacks';
import { STACKING_GUIDE } from '@/constants/guides';
import { Face, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { buildCuratedPlan } from '@/lib/curated';
import { haptics } from '@/lib/haptics';
import { MOMENTS } from '@/lib/moments';

/**
 * The library of ready-made stacks.
 *
 * This is the app's front door for a new user, and the reason the first-run empty state asks for
 * an *anchor* rather than a habit: a sequence hung on something you already do every day survives,
 * and a Muslim day is unusually rich in such anchors. Each card shows the cue, why it holds, and
 * the exact acts you'd be taking on — the decision is made with the whole thing visible, not after
 * committing to it.
 *
 * Adding is idempotent by design: acts already owned are skipped and a same-named stack is
 * appended to, so re-running a partly-added stack only fills the gaps.
 */
export default function StackLibraryScreen() {
  const router = useRouter();
  const { show } = useToast();
  const { presets } = useCatalog();
  const { habits, stacks, createHabits, createStack, updateStack, deleteStack, deleteHabit, moveHabit } = useHabits();

  // The from-scratch door, named once and offered twice — from the nav bar and from the closing
  // row. `replace`, not `push`: the library and the blank form are two answers to one question, so
  // going back from the form should land where the "+" sheet left you, not on the library again.
  const goCreateStack = () => router.replace('/habits/stack-new');

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

    show(`Added ${plan.name} — find it on Today`, 'success', {
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
    <AppScreen>
      {/* "Custom" opposite the route's Close: the same door the closing row opens, out of a scroll
          that is ~10 cards deep. See {@link headerNewAction} for why it is a word and not a "+". */}
      <Stack.Screen options={{ headerRight: headerNewAction('Custom', 'Build your own stack', goCreateStack) }} />

      {/* The case for anchoring, at the head of the screen where the anchoring is chosen — the
          photograph and the thesis always, the argument behind one tap. It used to be a row in the
          footer, below every card: an explanation offered after the decision it informs. */}
      <GuideIntro guide={STACKING_GUIDE} />

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
              onAdd={() => void addStack(curated)}
            />
          ))}
        </View>
      ))}

      {/* The from-scratch path stays one tap away without shouting over the library. The "why"
          that used to sit beside it now opens the screen instead. */}
      <View style={styles.group}>
        <Surface>
          <SettingsRow
            icon="stack"
            label="Your own stack"
            sublabel="Name it, anchor it to a moment, then add your acts"
            onPress={goCreateStack}
          />
        </Surface>
      </View>
    </AppScreen>
  );
}

/**
 * One ready-made stack, shown whole: its anchor emblem and name, the one line on why that cue
 * holds, and the acts in the order they're done. Acts the user already has are struck from the
 * "you'd be adding" count rather than hidden — the sequence is the thing being learned, so it is
 * always shown complete.
 */
function CuratedCard({
  curated,
  plan,
  onAdd,
}: {
  curated: CuratedStack;
  plan: ReturnType<typeof buildCuratedPlan>;
  onAdd: () => void;
}) {
  const theme = useTheme();
  const { presets } = useCatalog();
  const byId = new Map(presets.map((p) => [p.id, p]));
  const acts = curated.acts.map((a) => byId.get(a.presetId)?.name).filter((n): n is string => n !== undefined);
  const adding = plan?.inputs.length ?? 0;
  const gathering = plan?.gatherIds.length ?? 0;
  const moment = MOMENTS[curated.moment];

  // Three offers a card can make, and the label has to name the right one: create every act,
  // create only the ones missing, or create nothing at all and just anchor what is already kept.
  // That last case used to render as "Already yours" — a card claiming the user had a stack they
  // did not, over a button that was no longer there.
  const label =
    adding === 0 ? 'Anchor the acts you keep' : adding === acts.length ? 'Add this stack' : `Add the missing ${adding}`;
  const said: string[] = [];
  if (adding > 0) said.push(`Adds ${adding} act${adding === 1 ? '' : 's'}`);
  if (gathering > 0)
    said.push(`${said.length > 0 ? 'gathers' : 'Gathers'} ${gathering} act${gathering === 1 ? '' : 's'} you already keep`);
  const hint = `${said.join(', ')}, anchored to ${moment.label}.`;

  return (
    <View style={styles.card}>
      <Surface>
        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <AppIcon name={moment.icon} size={22} color={theme.textSecondary} />
            <ThemedText type="rowTitle" style={styles.cardTitle}>
              {curated.name}
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {curated.blurb}
          </ThemedText>
          <View style={styles.acts}>
            {acts.map((name, i) => (
              <Fragment key={name}>
                <ThemedText type="small" themeColor="textDisabled" style={styles.act}>
                  {`${i + 1}  ${name}`}
                </ThemedText>
              </Fragment>
            ))}
          </View>
          {plan === null ? (
            <View style={styles.added}>
              <AppIcon name="check" size={16} color={theme.textDisabled} />
              <ThemedText type="small" themeColor="textDisabled">
                Already yours
              </ThemedText>
            </View>
          ) : (
            <AppButton
              variant="secondary"
              onPress={onAdd}
              accessibilityLabel={`Add the ${curated.name} stack`}
              accessibilityHint={hint}>
              {label}
            </AppButton>
          )}
        </View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: Spacing.four },
  card: { marginBottom: Spacing.two },
  cardBody: { padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  // Semibold via the FACE, never fontWeight (the Android fake-bold gotcha).
  cardTitle: { flex: 1, fontFamily: Face.bodySemiBold },
  // The sequence, set as its own block so it reads as a list to learn rather than body copy.
  acts: { gap: Spacing.half, paddingVertical: Spacing.one },
  // Tabular figures so the ordinals form a true column.
  act: { fontVariant: ['tabular-nums'] },
  added: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
});
