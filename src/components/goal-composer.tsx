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
import { WeekdayPicker } from '@/components/weekday-picker';
import { GOAL_TEMPLATES, HORIZON_SPANS, defaultCadenceFor, type GoalTemplate } from '@/constants/goal-templates';
import { Spacing } from '@/constants/theme';
import { useGoals } from '@/hooks/use-goals';
import { useHabits } from '@/hooks/use-habits';
import { confirmProceed } from '@/lib/alerts';
import { CADENCES, cadenceOf, cadenceFields, hasCadence, type Cadenced, type CadenceKey } from '@/lib/check-ins';
import { hijriParts, todayLocalISO } from '@/lib/dates';
import { horizonFromLunarMonths } from '@/lib/goals';
import { haptics } from '@/lib/haptics';
import { MOMENTS, type MomentKey } from '@/lib/moments';

/** A cadence choice, plus the one the pills add: asking nothing at all. */
type CadenceChoice = CadenceKey | 'none';

/** The cadence fields that store "this goal asks nothing" — all three columns empty together,
 *  which is the only other shape `goals_check_in_cadence` permits. A function rather than a
 *  constant so each save gets its own array: the columns are mutable on the way to Supabase. */
const noCadence = (): Pick<Cadenced, 'check_in_days' | 'check_in_hijri' | 'check_in_from'> => ({
  check_in_days: [],
  check_in_hijri: null,
  check_in_from: null,
});

/**
 * Setting a goal — and, with an `id`, editing one.
 *
 * It opens on a template rather than a blank form, and not for convenience. Goal-setting theory
 * turns on specificity, and the two things nobody knows about a twenty-year undertaking are the
 * number and the practice: someone who means to memorise the Qurʾān does not know it is 9,060
 * lines, and — the half that decides whether it happens — does not know the new material is the
 * easy part. A template carries both, and says the second one out loud before you save.
 *
 * **It also sets the goal's check-in, in the same form.** That used to be a second screen behind a
 * second entry in the "+" sheet, which meant a goal saved here appeared precisely nowhere until
 * you found the other door and picked the goal back out of a list. A horizon nothing ever asks
 * about is the one shape of goal the evidence is unanimous against: Harkin (2016) puts the whole
 * effect through how often you monitor. So the ask is part of setting the goal, and the goal lands
 * on Today the moment it is saved.
 *
 * The two fields at the foot are the ones with the strongest evidence behind them and the least
 * obvious payoff: naming the obstacle, and pre-deciding the response. They are optional, because
 * a goal you refused to finish a form for is worse than a goal with two blank fields — but the
 * `if_then` is not decoration. It is shown back at the moment it is for, when one of the goal's
 * acts is about to be skipped.
 *
 * In edit mode the acts are left alone: they are ordinary habits on your day by then, edited where
 * every other habit is. This screen owns the horizon, the numbers, and how often it asks.
 */
export default function GoalComposerScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { show } = useToast();
  // Deliberately NOT `useProgress`: that hook pulls the user's entire completion history on
  // mount (it has to — "this life" is measured in Hijri years), and this screen needs one stored
  // row and today's date. `useGoals` already holds the row, and the date is a pure function.
  const { createGoal, updateGoal, saveCheckIn, goals: storedGoals, checkIns, loading: goalsLoading } = useGoals();
  const today = todayLocalISO();
  const { habits, stacks, createHabits, createStack, updateStack, deleteHabit } = useHabits();

  const editing = id ? (storedGoals.find((g) => g.id === id) ?? null) : null;

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
  /**
   * Whether the span control has been touched this session. Without it, editing a goal moved its
   * horizon: the stored date is SNAPPED to the nearest offered span on open (51 months left reads
   * as "5 years"), and saving wrote that span forward from today — so opening a goal to fix a
   * typo pushed its by-when eight months out, silently, every time.
   */
  const [spanTouched, setSpanTouched] = useState(false);
  const [moment, setMoment] = useState<MomentKey | null>(null);
  const [obstacle, setObstacle] = useState(editing?.obstacle ?? '');
  const [ifThen, setIfThen] = useState(editing?.if_then ?? '');

  // ── The ask ──────────────────────────────────────────────────────────────────────────────────
  //
  // Derived from the template or the stored row, never seeded into state: `null` means untouched,
  // so picking a different template moves the default with it and opening a goal that already asks
  // weekly shows "Once a week". (`react-hooks/set-state-in-effect` rejects the copy-into-state
  // shape a seed-once version would need, and this is the rule `plan.tsx` follows.)
  const [chosenCadence, setChosenCadence] = useState<CadenceChoice | null>(null);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [startText, setStartText] = useState('');

  const storedCadence: CadenceChoice = editing
    ? hasCadence(editing)
      ? (cadenceOf(editing) ?? 'weekly')
      : 'none'
    : template
      ? defaultCadenceFor(template)
      : 'weekly';
  const cadence = chosenCadence ?? storedCadence;
  const pickedWeekday = weekday ?? editing?.check_in_days[0] ?? 1;

  /**
   * A goal that comes down cannot stop asking, and the database says so
   * (`goals_down_needs_check_in`): nothing you tick subtracts, so its check-ins are the only thing
   * that measures it at all. Offering "Not for now" there would be offering a save that the server
   * rejects — so the option is withheld and the section says why.
   */
  const mustAsk = editing?.direction === 'down';
  const measured = editing ? checkIns.some((c) => c.goal_id === editing.id) : false;
  const needsStart = cadence !== 'none' && !measured;

  // An untouched edit keeps the date exactly as stored; only a deliberate span choice recomputes.
  const horizon = useMemo(
    () => (editing && !spanTouched ? editing.horizon_on : horizonFromLunarMonths(today, spanMonths)),
    [editing, spanTouched, today, spanMonths],
  );
  const target = Number(targetText.replace(/[^0-9.]/g, ''));
  // Accepts a comma as well as a point, like the check-in field: half this app's users type a
  // decimal one way and half the other.
  const start = Number(startText.trim().replace(',', '.'));
  const startGiven = startText.trim().length > 0 && Number.isFinite(start);
  const canSave =
    title.trim().length > 0 && unit.trim().length > 0 && target > 0 && horizon !== null && (!needsStart || startGiven);

  /** Applying a template fills every field it knows — and leaves anything already typed alone. */
  const pickTemplate = (next: GoalTemplate) => {
    setTemplateId(next.id);
    if (next.id === 'blank') return;
    setTitle(next.title);
    setUnit(next.unit);
    setTargetText(next.targetValue === null ? '' : String(next.targetValue));
    setMoment(next.moment);
  };

  const save = () => {
    if (!canSave || !horizon) return;
    // A first reading past the target settles `direction` as falling, permanently: nothing in the
    // app can turn it back, and a typo'd digit makes an ordinary climbing goal read "Reached" with
    // milestones marching below zero. This is the one moment that decision is made, and now the
    // only screen where the target and the reading are visible together — so it is asked.
    if (needsStart && start > target) {
      confirmProceed({
        title: 'A goal that comes down?',
        message: `You are at ${start} ${unit.trim()}, past the ${target} you are aiming for. That makes this a measure you bring down, and it cannot be changed afterwards.`,
        confirmLabel: 'Yes, bring it down',
        onConfirm: commit,
      });
      return;
    }
    commit();
  };

  const commit = () => {
    if (!horizon) return;
    // An ask already running keeps the day it started from; only a goal that has never asked
    // begins today. Rewriting `check_in_from` on every edit would move the window the lookback
    // walks back through, for no reason the user asked for.
    const from = editing?.check_in_from ?? today;
    const fields = cadence === 'none' ? noCadence() : cadenceFields(cadence, pickedWeekday, from);

    if (editing) {
      haptics.added();
      void (async () => {
        // A starting value above the target means the measure has to fall. Settled once, stored,
        // and never asked again: inferred live, a weight goal would read as reached the first time
        // it dipped under target and stay wrong when it rose back.
        const direction = needsStart && start > editing.target_value ? 'down' : editing.direction;
        const saved = await updateGoal(editing.id, {
          title: title.trim(),
          unit: unit.trim(),
          target_value: target,
          horizon_on: horizon,
          obstacle: obstacle.trim(),
          if_then: ifThen.trim(),
          ...fields,
          direction,
        });
        // The baseline second, and after the cadence — a goal that asks but has no baseline yet is
        // a state its screen already knows how to say, where a baseline on a goal that asks
        // nothing would be a reading nobody will ever be prompted to follow.
        if (saved && needsStart) await saveCheckIn(editing.id, { takenOn: today, value: start, note: '' });
        // Awaited before leaving: Today refetches its goals on focus the instant this pops, and
        // `fetchGoals` sets the rows wholesale — a write that loses that race is dropped.
        router.back();
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
        // The horizon, its engine and its first reading in one write. `createGoal` has taken both
        // of these since the day it was written; nothing had ever handed them to it, because the
        // cadence lived on a different screen.
        cadence: cadence === 'none' ? undefined : fields,
        startValue: needsStart && startGiven ? start : undefined,
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
      router.back();
      show(created.length > 0 ? `${title.trim()} set. Its acts are on Today.` : `${title.trim()} set`, 'success');
    })();
  };

  // An edit whose row has not arrived yet must show nothing rather than the template picker: its
  // fields are seeded once, from `editing`, so a form built before the goal loaded would be blank
  // AND still wired to `updateGoal` — one Save away from overwriting the goal with its own
  // defaults.
  if (id && !editing) {
    return (
      <FormScreen>
        <Stack.Screen options={{ title: 'Edit goal', headerTitleAlign: 'center' }} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.lede}>
          {goalsLoading ? 'Loading…' : 'That goal is no longer here.'}
        </ThemedText>
      </FormScreen>
    );
  }

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
            onPress={() => {
              setSpanMonths(span.months);
              setSpanTouched(true);
            }}
          />
        ))}
      </View>
      {/* The span is what you choose; the month is what the app counts in. Saying both here is
          what stops "5 years" from silently becoming a Gregorian date nobody agreed to. */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        {horizonLabel(horizon)}
      </ThemedText>

      {/* How often it asks. A check-in is the goal's own row on Today, in the same ring column as
          everything else you tick — so this control is what decides whether the goal is a thing
          you meet or a page you have to remember to visit. */}
      <FieldLabel style={styles.label}>HOW OFTEN IT ASKS</FieldLabel>
      <View style={styles.cadences}>
        {CADENCES.map((option) => (
          <SelectablePill
            key={option.key}
            label={option.label}
            selected={cadence === option.key}
            onPress={() => {
              haptics.selection();
              setChosenCadence(option.key);
            }}
          />
        ))}
        {mustAsk ? null : (
          <SelectablePill
            label="Not for now"
            selected={cadence === 'none'}
            onPress={() => {
              haptics.selection();
              setChosenCadence('none');
            }}
          />
        )}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
        {cadenceHint(cadence, mustAsk)}
      </ThemedText>

      {cadence === 'weekly' ? (
        <WeekdayPicker
          days={new Set([pickedWeekday])}
          // One day, not a set: a weekly check-in asks once. Tapping another day moves it
          // rather than adding a second, which is what the shared picker would otherwise do.
          onChange={(days) => {
            const next = [...days].find((d) => d !== pickedWeekday);
            if (next !== undefined) setWeekday(next);
          }}
        />
      ) : null}

      {needsStart ? (
        <>
          <FieldLabel style={styles.label}>WHERE IT STANDS NOW</FieldLabel>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {`This is the goal's first reading, and it is what tells the app which way it has to travel to reach ${target > 0 ? target : 'the target'} ${unit.trim()}.`}
          </ThemedText>
          <View style={styles.measure}>
            <View style={styles.half}>
              {/* No `placeholder`: `FormField` falls back to it as the field's LABEL when no label
                  is given (`label ?? props.placeholder`), so a placeholder of "0" printed a stray
                  "0" caption above the box — under a section heading that had already named the
                  field. The heading and the sentence above it say what to type; the decimal pad
                  says it is a number. */}
              <FormField
                value={startText}
                onChangeText={setStartText}
                keyboardType="decimal-pad"
                accessibilityLabel={`Starting reading in ${unit.trim()}`}
              />
            </View>
            <View style={styles.unit}>
              <ThemedText type="rowTitle" themeColor="textSecondary">
                {unit.trim()}
              </ThemedText>
            </View>
          </View>
        </>
      ) : null}

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

/**
 * What the chosen cadence means for the day — said once, under the pills.
 *
 * The `mustAsk` line is not optional politeness. A goal that comes down has no "Not for now" pill
 * at all, and an option that silently is not there owes the reader a reason exactly as much as a
 * control that declines a tap does (`expandable-add-row.tsx` learned that the hard way). Its case
 * comes first because the missing pill is what needs explaining, whichever cadence is selected.
 */
function cadenceHint(cadence: CadenceChoice, mustAsk: boolean): string {
  if (mustAsk) {
    return 'It appears on your day when it is due. A measure that comes down is only ever moved by a check-in, so this one always asks.';
  }
  return cadence === 'none'
    ? 'It will sit in Progress and ask nothing. You can start it asking later.'
    : 'It appears on your day when it is due, and stays there until you answer it.';
}

const styles = StyleSheet.create({
  lede: { marginBottom: Spacing.two },
  label: { marginTop: Spacing.three },
  pair: { flexDirection: 'row', gap: Spacing.three },
  half: { flex: 1 },
  spans: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  cadences: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  hint: { marginTop: Spacing.two },
  // `FormField` spreads `style` onto its `TextInput`, so the flex belongs on a `View` around it.
  measure: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  unit: { paddingTop: Spacing.one },
});
