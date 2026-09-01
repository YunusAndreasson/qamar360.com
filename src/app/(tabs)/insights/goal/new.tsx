import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FieldLabel } from '@/components/field-label';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { MomentPicker } from '@/components/moment-picker';
import { SelectablePill } from '@/components/selectable-pill';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { GOAL_TEMPLATES, HORIZON_SPANS, type GoalTemplate } from '@/constants/goal-templates';
import { Spacing } from '@/constants/theme';
import { useGoals } from '@/hooks/use-goals';
import { useHabits } from '@/hooks/use-habits';
import { useProgress } from '@/hooks/use-progress';
import { hijriParts } from '@/lib/dates';
import { horizonFromLunarMonths } from '@/lib/goals';
import { haptics } from '@/lib/haptics';
import { MOMENTS, type MomentKey } from '@/lib/moments';

/**
 * Setting a goal — and, with an `id`, editing one.
 *
 * It opens on a template rather than a blank form, and not for convenience. Goal-setting theory
 * turns on specificity, and the two things nobody knows about a twenty-year undertaking are the
 * number and the practice: someone who means to memorise the Qurʾān does not know it is 9,060
 * lines, and — the half that decides whether it happens — does not know the new material is the
 * easy part. A template carries both, and says the second one out loud before you save.
 *
 * The two fields at the foot are the ones with the strongest evidence behind them and the least
 * obvious payoff: naming the obstacle, and pre-deciding the response. They are optional, because
 * a goal you refused to finish a form for is worse than a goal with two blank fields — but the
 * `if_then` is not decoration. It is shown back at the moment it is for, when one of the goal's
 * acts is about to be skipped.
 *
 * In edit mode the acts are left alone: they are ordinary habits on your day by then, edited where
 * every other habit is. This screen only ever owns the horizon and the numbers.
 */
export default function GoalComposerScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { show } = useToast();
  const { goals: readings, today, refresh } = useProgress();
  const { createGoal, updateGoal } = useGoals();
  const { habits, stacks, createHabits, createStack, updateStack, deleteHabit } = useHabits();

  const editing = id ? (readings.find((r) => r.goal.id === id)?.goal ?? null) : null;

  const [templateId, setTemplateId] = useState<string | null>(editing ? 'blank' : null);
  const template = GOAL_TEMPLATES.find((t) => t.id === templateId) ?? null;

  const [title, setTitle] = useState(editing?.title ?? '');
  const [unit, setUnit] = useState(editing?.unit ?? '');
  const [targetText, setTargetText] = useState(editing ? String(editing.target_value) : '');
  const [spanMonths, setSpanMonths] = useState<number>(() => {
    if (!editing) return 59; // five years — the middle of the range, and the shape of most of these
    // An existing horizon is offered as the nearest span rather than as a raw date: the control is
    // a span, so the value it shows has to be one of its own options.
    const parts = hijriParts(editing.horizon_on);
    const now = hijriParts(today);
    if (!parts || !now) return 59;
    const months = (parts.year - now.year) * 12 + (parts.month - now.month);
    return HORIZON_SPANS.reduce((best, s) => (Math.abs(s.months - months) < Math.abs(best - months) ? s.months : best), 59);
  });
  const [moment, setMoment] = useState<MomentKey | null>(null);
  const [obstacle, setObstacle] = useState(editing?.obstacle ?? '');
  const [ifThen, setIfThen] = useState(editing?.if_then ?? '');

  /** Applying a template fills every field it knows — and leaves anything already typed alone. */
  const pickTemplate = (next: GoalTemplate) => {
    setTemplateId(next.id);
    if (next.id === 'blank') return;
    setTitle(next.title);
    setUnit(next.unit);
    setTargetText(next.targetValue === null ? '' : String(next.targetValue));
    setMoment(next.moment);
  };

  const horizon = useMemo(() => horizonFromLunarMonths(today, spanMonths), [today, spanMonths]);
  const target = Number(targetText.replace(/[^0-9.]/g, ''));
  const canSave = title.trim().length > 0 && unit.trim().length > 0 && target > 0 && horizon !== null;

  const save = () => {
    if (!canSave || !horizon) return;

    if (editing) {
      haptics.added();
      router.back();
      void (async () => {
        await updateGoal(editing.id, {
          title: title.trim(),
          unit: unit.trim(),
          target_value: target,
          horizon_on: horizon,
          obstacle: obstacle.trim(),
          if_then: ifThen.trim(),
        });
        await refresh();
      })();
      return;
    }

    void (async () => {
      // The acts first, then the stack, then the goal that points at them — each step reading the
      // arrangement the one before it left. The order matters at the failure end: a goal with no
      // acts is a state its screen can describe and you can repair, while acts with no goal are
      // just habits, which is a perfectly good thing to be left holding.
      const acts = template?.acts ?? [];
      const created = acts.length
        ? await createHabits(
            acts.map((a) => ({
              name: a.name,
              schedule_days: a.scheduleDays,
              target_count: a.targetCount,
              target_unit: a.targetUnit,
            })),
          )
        : [];
      if (acts.length > 0 && created.length === 0) return; // createHabits has already said why

      if (created.length > 0 && moment) {
        const stackName = MOMENTS[moment].stackName;
        const twin = stacks.find((s) => s.name === stackName) ?? null;
        const ids = created.map((h) => h.id);
        if (twin) {
          // Append to the stack the user already keeps for this moment rather than raising a twin
          // beside it — the same rule the curated library follows.
          const current = habits
            .filter((h) => h.stack_id === twin.id)
            .sort((a, b) => a.position - b.position)
            .map((h) => h.id);
          await updateStack(twin.id, { orderedMemberIds: [...current, ...ids] });
        } else {
          const stackId = await createStack(stackName, ids, { moment });
          // An anchoring that could not anchor undoes itself rather than stranding its acts loose
          // at the foot of Today under a success message (`stack-library.tsx` learned this the day
          // a new moment key met a CHECK constraint that had never heard of it).
          if (!stackId) {
            for (const habit of created) void deleteHabit(habit.id);
            return;
          }
        }
      }

      const goal = await createGoal({
        title: title.trim(),
        unit: unit.trim(),
        target_value: target,
        milestone_step: template?.milestoneStep ?? null,
        horizon_on: horizon,
        obstacle: obstacle.trim(),
        if_then: ifThen.trim(),
        // Matched by name, never by index. `createHabits` can return fewer rows than it was
        // given (it drops any cancelled mid-flight), and a positional pairing would then slide
        // the flags one act along — quietly marking a revision act as the one that counts, which
        // is the single wrong answer this whole schema exists to prevent.
        acts: acts.flatMap((act) => {
          const habit = created.find((h) => h.name === act.name);
          return habit ? [{ habitId: habit.id, contributes: act.contributes }] : [];
        }),
      });
      if (!goal) return;
      haptics.added();
      await refresh();
      router.back();
      show(created.length > 0 ? `${title.trim()} — its acts are on Today` : `${title.trim()} set`, 'success');
    })();
  };

  // The template choice comes first and alone: everything below it is prefilled by the answer.
  if (!template) {
    return (
      <FormScreen>
        <Stack.Screen options={{ title: 'New goal', headerTitleAlign: 'center' }} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
          A goal here is a horizon over acts you keep, not a list to tick. Pick what it is, and the
          acts that produce it come with it.
        </ThemedText>
        <SettingsSection>
          {GOAL_TEMPLATES.map((t) => (
            <SettingsRow key={t.id} label={t.title} sublabel={t.blurb} showChevron onPress={() => pickTemplate(t)} />
          ))}
        </SettingsSection>
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: editing ? 'Edit goal' : template.title,
          headerTitleAlign: 'center',
          ...formHeaderActions({ onCancel: () => router.back(), onSave: save, canSave, saveLabel: editing ? 'Save' : 'Set' }),
        }}
      />

      {/* What this kind of goal usually gets wrong, before it is saved rather than after it has
          failed. Only the templates that have something specific to say carry one. */}
      {/* A `SettingsRow` clipped this to one line, which is the one thing it could not afford to
          be: it is a paragraph, and the reason the template exists. A plain surface lets it run. */}
      {template.caution && !editing ? (
        <Surface padded>
          <ThemedText type="small" themeColor="textSecondary">
            {template.caution}
          </ThemedText>
        </Surface>
      ) : null}

      <FormField label="Goal" value={title} onChangeText={setTitle} placeholder="What you mean to have done" />

      {/* Each field is wrapped rather than given `style`: `FormField` spreads its props onto the
          `TextInput`, so a flex passed straight in stretches the input inside a wrapper that
          never grew — which put both labels beside their boxes instead of above them. */}
      <View style={styles.pair}>
        <View style={styles.half}>
          <FormField
            label="How much"
            value={targetText}
            onChangeText={setTargetText}
            keyboardType="number-pad"
            placeholder="9060"
          />
        </View>
        <View style={styles.half}>
          <FormField label="Counted in" value={unit} onChangeText={setUnit} placeholder="lines" />
        </View>
      </View>

      <FieldLabel style={styles.label}>BY WHEN</FieldLabel>
      <View style={styles.spans}>
        {HORIZON_SPANS.map((span) => (
          <SelectablePill
            key={span.months}
            label={span.label}
            selected={spanMonths === span.months}
            onPress={() => setSpanMonths(span.months)}
          />
        ))}
      </View>
      {/* The span is what you choose; the month is what the app counts in. Saying both here is
          what stops "5 years" from silently becoming a Gregorian date nobody agreed to. */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        {horizonLabel(horizon)}
      </ThemedText>

      {!editing && template.acts.length > 0 ? (
        <>
          <FieldLabel style={styles.label}>ANCHORED AFTER</FieldLabel>
          <MomentPicker value={moment} onChange={setMoment} />
        </>
      ) : null}

      <FormField
        label="What usually stops this?"
        value={obstacle}
        onChangeText={setObstacle}
        placeholder="Travelling, or a bad night"
        multiline
      />
      <FormField
        label="And when it does, I will —"
        value={ifThen}
        onChangeText={setIfThen}
        placeholder="Do half of it before I sleep"
        hint="You are shown this again the moment you go to skip one of these acts, which is the only moment it is any use."
        multiline
      />
    </FormScreen>
  );
}

/** The chosen span, said back as the Hijri month it lands in. */
function horizonLabel(horizon: string | null): string {
  if (!horizon) return 'This device has no Islamic calendar, so a horizon cannot be set.';
  const parts = hijriParts(horizon);
  return parts ? `Through ${parts.monthName} ${parts.year}` : '';
}

const styles = StyleSheet.create({
  lede: { marginBottom: Spacing.two },
  label: { marginTop: Spacing.three },
  pair: { flexDirection: 'row', gap: Spacing.three },
  half: { flex: 1 },
  spans: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  hint: { marginTop: Spacing.two },
});
