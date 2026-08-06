import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppIcon } from '@/components/app-icon';
import { AppScreen } from '@/components/app-screen';
import { RowSeparator } from '@/components/row-separator';
import { SectionLabel } from '@/components/section-label';
import { SettingsRow } from '@/components/settings-row';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { CURATED_GROUPS, type CuratedStack } from '@/constants/curated-stacks';
import { Face, Spacing } from '@/constants/theme';
import { useCatalog } from '@/hooks/use-catalog';
import { useHabits } from '@/hooks/use-habits';
import { useTheme } from '@/hooks/use-theme';
import { buildCuratedPlan } from '@/lib/curated';
import { haptics } from '@/lib/haptics';
import { MOMENTS } from '@/lib/moments';
import { normalizeName } from '@/lib/names';

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
  const { habits, stacks, createHabits, createStack, updateStack, deleteStack, deleteHabit } = useHabits();

  // Folded habit names, the dedupe key everywhere in the app. (No useMemo — the React Compiler
  // memoizes derived values.)
  const owned = new Set(habits.map((h) => normalizeName(h.name)));

  const addStack = async (curated: CuratedStack) => {
    const plan = buildCuratedPlan(curated, presets, owned, stacks);
    if (!plan) return; // everything already owned — the card reads as added
    const created = await createHabits(plan.inputs);
    if (created.length === 0) return; // createHabits already surfaced the error
    haptics.added();

    const ids = created.map((h) => h.id);
    let createdStackId: string | null = null;
    if (plan.existingStackId) {
      // Append to the user's own same-named stack (its membership didn't change during the
      // insert — the new rows landed unanchored), keeping their order ahead of the new tail.
      const current = habits
        .filter((h) => h.stack_id === plan.existingStackId)
        .sort((a, b) => a.position - b.position)
        .map((h) => h.id);
      await updateStack(plan.existingStackId, { orderedMemberIds: [...current, ...ids] });
    } else {
      createdStackId = await createStack(plan.name, ids, { moment: plan.moment });
    }

    show(`Added ${plan.name} — find it on Today`, 'success', {
      label: 'Undo',
      onPress: () => {
        // Shell first, then acts: deleting the acts first would trip the stack's empty-shell
        // sweep against a ref that hasn't seen the previous delete yet, and could strand a shell
        // that now renders as an empty card.
        if (createdStackId) void deleteStack(createdStackId);
        for (const habit of created) void deleteHabit(habit.id);
      },
    });
  };

  return (
    <AppScreen>
      <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
        Anchor a stack to something you already do — the cue you never forget.
      </ThemedText>

      {CURATED_GROUPS.map((group) => (
        <View key={group.key} style={styles.group}>
          <SectionLabel>{group.title}</SectionLabel>
          {group.stacks.map((curated) => (
            <CuratedCard
              key={curated.id}
              curated={curated}
              // A stack whose every act is already owned has nothing left to add.
              plan={buildCuratedPlan(curated, presets, owned, stacks)}
              onAdd={() => void addStack(curated)}
            />
          ))}
        </View>
      ))}

      {/* The from-scratch path stays one tap away without shouting over the library, and the
          short "why this works" sits beside it for anyone who wants the reasoning first. */}
      <View style={styles.group}>
        <Surface>
          <SettingsRow
            icon="stack"
            label="Your own stack"
            sublabel="Name it, anchor it to a moment, then add your acts"
            onPress={() => router.replace('/habits/stack-new')}
          />
          <RowSeparator />
          <SettingsRow
            icon="help"
            label="Why anchoring works"
            sublabel="The short version, with the Sunnah behind it"
            onPress={() => router.push('/habits/stacking-info')}
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
  const moment = MOMENTS[curated.moment];

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
          {adding === 0 ? (
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
              accessibilityHint={`Adds ${adding} act${adding === 1 ? '' : 's'}, anchored to ${moment.label}.`}>
              {adding === acts.length ? 'Add this stack' : `Add the missing ${adding}`}
            </AppButton>
          )}
        </View>
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  lede: { marginHorizontal: Spacing.three, marginBottom: Spacing.four },
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
