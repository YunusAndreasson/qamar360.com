import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ErrorBanner } from '@/components/error-banner';
import { GoalTrendChart } from '@/components/goal-trend-chart';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { Surface } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { useToast } from '@/components/toast';
import { Spacing } from '@/constants/theme';
import { useGoals } from '@/hooks/use-goals';
import { useHabits, useHabitsNavigation } from '@/hooks/use-habits';
import { useProgress } from '@/hooks/use-progress';
import { confirmDestructive } from '@/lib/alerts';
import { describeCadence, hasCadence, latestBefore, readingLine } from '@/lib/check-ins';
import { formatMeasure, goalSeries, type GoalReading } from '@/lib/goals';
import { haptics } from '@/lib/haptics';
import { usePreference } from '@/lib/preferences';

/**
 * One goal, in full.
 *
 * The screen is built around a single sentence — what this lunar month is asking for — and one
 * button that turns it into today's target. Everything under those two is context for a decision
 * you have already been given: how far along you are, how fast you are really going, and the
 * month you arrive at that speed.
 *
 * There is no bar, no percentage and no "behind". A long goal is lost by abandonment rather than
 * by any single bad month, and a screen that scores you invites exactly the all-or-nothing reading
 * that ends one. What it does instead is re-plan: the ask is recomputed from what actually
 * happened, and when it outruns what you have ever managed the screen says the horizon is wrong
 * rather than that you are.
 */
export default function GoalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { show } = useToast();
  const { goals: readings, refresh } = useProgress();
  const { checkIns, updateGoal, deleteGoal, error, dismissError, loading } = useGoals();
  const { updateHabit } = useHabits();
  const { today } = useHabitsNavigation();
  const weekStart = usePreference('weekStart');

  const reading = readings.find((r) => r.goal.id === id) ?? null;

  if (!reading) {
    // Two different states wearing one shape. Until the goals have loaded — a cold start, or a
    // notification opening this route directly — there is simply no answer yet, and saying "no
    // longer here" would be a verdict delivered before the question was asked.
    return (
      <AppScreen transparent centered>
        <Stack.Screen options={{ title: 'Goal' }} />
        <ThemedText type="rowTitle">{loading ? 'Loading…' : 'That goal is no longer here.'}</ThemedText>
      </AppScreen>
    );
  }

  const { goal, acts, earned, remaining, measured, awaiting, dailyTarget, pace, arrival, horizon, milestones, met, overdue, reachable } =
    reading;
  const series = goalSeries(goal.id, checkIns);
  const asking = hasCadence(goal);
  const lastReading = latestBefore(checkIns, goal.id, '9999-12-31');
  const contributor = acts.find((a) => a.contributes) ?? null;
  const down = goal.direction === 'down';
  // Only worth offering when it would actually change something: an act already sitting at the
  // right target needs no button, and a button that does nothing teaches you to stop reading them.
  const offerTarget = dailyTarget !== null && contributor !== null && contributor.targetCount !== dailyTarget;

  const acceptTarget = () => {
    if (!contributor || dailyTarget === null) return;
    haptics.added();
    void (async () => {
      // `reconcileViewedDay: false` — this screen has no view of a day. The habit editor's
      // reconcile rewrites whatever day the Today tab is parked on, which here would mean an
      // accepted target quietly editing a completion row weeks in the past.
      await updateHabit(contributor.habitId, { target_count: dailyTarget, target_unit: goal.unit }, { reconcileViewedDay: false });
      await refresh();
      show(`${contributor.name} now asks ${dailyTarget} a day`, 'success');
    })();
  };

  const markReached = () => {
    void (async () => {
      if (await updateGoal(goal.id, { status: 'reached' })) {
        haptics.added();
        show('Marked as reached', 'success');
      }
    })();
  };

  const setAside = () => {
    void (async () => {
      if (await updateGoal(goal.id, { status: 'released' })) show('Set aside — it stays in your record', 'success');
    })();
  };

  const reopen = () => {
    void (async () => {
      if (await updateGoal(goal.id, { status: 'open' })) show('Open again', 'success');
    })();
  };

  const remove = () =>
    confirmDestructive({
      title: `Delete ${goal.title}?`,
      // The acts are the user's own habits and their history is the record — deleting the horizon
      // must not reach into either, and the dialog has to say so or nobody will risk the button.
      message: 'The acts behind it stay on your day, with everything you have logged against them.',
      onConfirm: () => {
        router.back();
        void deleteGoal(goal.id);
      },
    });

  return (
    <AppScreen transparent>
      <Stack.Screen options={{ title: goal.title }} />
      <ErrorBanner message={error} onDismiss={dismissError} />

      <Ask reading={reading} />

      {offerTarget ? (
        <SettingsSection>
          {/* The label says what the tap does; the act it does it to goes underneath. Naming the
              act first ("Ask memorised the new lines for 14 a day") read as a garbled sentence
              and ran past the row's width. */}
          <SettingsRow
            icon="check"
            label={`Set today’s target to ${dailyTarget} a day`}
            sublabel={
              contributor.targetCount === null
                ? contributor.name
                : `${contributor.name} · ${contributor.targetCount} a day now`
            }
            onPress={acceptTarget}
          />
        </SettingsSection>
      ) : null}

      {/* The horizon is wrong, not the person. Say what would fit, and leave the change to them.
          The reach test and the arrival date are two different figures — the first is measured
          against your BEST closed month, the second against your recent pace — so the sentence
          names the one it is actually quoting. */}
      {!reachable && arrival ? (
        <SettingsSection footer={`At the pace of your last few months this arrives in ${arrival.monthName} ${arrival.year}. Moving the horizon there is the honest version of this goal — the alternative is a monthly target you have never once hit.`}>
          <SettingsRow
            icon="calendar"
            label="This asks for more than your best month"
            sublabel={`Move the horizon to ${arrival.monthName} ${arrival.year}`}
            showChevron
            onPress={() => router.push({ pathname: '/(tabs)/progress/goal/edit', params: { id: goal.id } })}
          />
        </SettingsSection>
      ) : null}

      {/* The line the check-ins draw. Above THE MEASURE because a picture of where the number has
          been answers "am I moving?" faster than any row of figures under it can. */}
      {asking ? (
        <GoalTrendChart series={series} target={goal.target_value} unit={goal.unit} today={today} />
      ) : null}

      <SettingsSection title="THE MEASURE">
        {/* A goal that reports its own position says where it *is*; one summed from acts says how
            much of the target has been covered. The same row, two different sentences, because
            "82.4 of 75 kg" is not a thing anyone would say out loud. */}
        {awaiting ? (
          <SettingsRow label="Where you are" value="Not measured yet" sublabel="Its first check-in sets the baseline" />
        ) : measured ? (
          <SettingsRow
            label="Where you are"
            value={`${formatMeasure(earned)} ${goal.unit}`}
            sublabel={met ? 'At the target' : `${formatMeasure(remaining)} ${goal.unit} to go`}
          />
        ) : (
          <SettingsRow label="Done so far" value={`${formatMeasure(earned)} of ${formatMeasure(goal.target_value)} ${goal.unit}`} />
        )}
        {milestones ? (
          <SettingsRow
            label="Steps done"
            value={`${milestones.reached} of ${Math.round(goal.target_value / milestones.step)}`}
            sublabel={milestones.next === null ? 'The last step is the whole of it' : `Next at ${formatMeasure(milestones.next)} ${goal.unit}`}
          />
        ) : null}
        {/* Pace `null` means no closed month yet — a goal a week old has not earned an opinion
            about itself, so it is given none rather than a zero that reads as a verdict. */}
        {pace !== null ? (
          <SettingsRow label="Each month lately" value={`${formatMeasure(pace)} ${goal.unit}`} />
        ) : null}
        {arrival && !met ? <SettingsRow label="At this pace" value={`${arrival.monthName} ${arrival.year}`} /> : null}
        {horizon ? (
          <SettingsRow label="By" value={`${horizon.monthName} ${horizon.year}`} sublabel={overdue ? 'The horizon has passed' : undefined} />
        ) : null}
      </SettingsSection>

      {/* A falling measure takes NO act credit — `computeGoals` reads the latest reading and stops
          (`goals.ts`), because nothing you tick subtracts. So the `contributes` flag, which is the
          whole vocabulary of this section, means nothing here and the section has to say what is
          true instead: these acts are your practice, and the number moves when you report it. */}
      <SettingsSection
        title="THE ACTS"
        footer={
          acts.length === 0
            ? // "Its acts were deleted" was the only story this said, and it is now the rarer one:
              // a goal set from the blank template never had acts, and does not want any — its
              // check-in IS the measurement. Telling that user something was destroyed is both
              // false and alarming, so the two states are separated by what can actually still
              // move the number.
              asking
              ? 'Nothing you tick moves this one. Its measure is whatever you report at the check-in.'
              : 'Nothing is driving this goal, and nothing is asking about it, so its measure cannot move. Edit it to start it asking, or set the goal again to give it acts.'
            : down
              ? 'A measure that comes down is moved by your check-ins, never by what you tick. These are the practice behind it.'
              : 'Revision does not add to the count. It is what keeps what you have already done from draining away.'
        }>
        {acts.map((act) => (
          <SettingsRow
            key={act.habitId}
            label={act.name}
            sublabel={
              down
                ? 'On your day, and not counted here'
                : act.contributes
                  ? `Counts toward the ${goal.unit}`
                  : 'Revision — holds what is already there'
            }
            value={act.targetCount !== null ? `${act.targetCount} a day` : undefined}
          />
        ))}
      </SettingsSection>

      {/* What the goal asks of the day. It states the cadence and does not navigate: a reading is
          given on Today, in the row this cadence puts there, and the cadence itself is changed
          where the rest of the goal is. Both doors used to be here, and both crossed into another
          tab to open — which is how checking in from a goal lost your place entirely. */}
      <SettingsSection
        title="CHECK-IN"
        footer={
          asking
            ? 'It appears on your day when it is due, and stays there until you answer it.'
            : 'Nothing is asking about this one. Edit the goal to start it asking.'
        }>
        <SettingsRow
          icon="checkIn"
          label={asking ? describeCadence(goal, weekStart) : 'Not asking'}
          sublabel={
            lastReading
              ? `Last ${readingLine(lastReading.value, goal.unit, lastReading.taken_on, today)}`
              : 'Nothing recorded yet'
          }
        />
      </SettingsSection>

      {/* Not a slogan on the wall: this is also shown at the one moment it is for, when an engine
          act is about to be skipped (`act-actions.tsx`). Here it is only so you can read it back. */}
      {goal.if_then ? (
        <SettingsSection title="WHEN IT SLIPS" footer={goal.obstacle ? `What usually stops it: ${goal.obstacle}` : undefined}>
          <SettingsRow label={goal.if_then} />
        </SettingsSection>
      ) : null}

      <SettingsSection>
        <SettingsRow icon="edit" label="Edit" showChevron onPress={() => router.push({ pathname: '/(tabs)/progress/goal/edit', params: { id: goal.id } })} />
        {goal.status === 'open' ? (
          <>
            {met ? <SettingsRow icon="check" label="Mark as reached" onPress={markReached} /> : null}
            <SettingsRow label="Set aside" sublabel="Keeps the record and stops the monthly ask" onPress={setAside} />
          </>
        ) : (
          <SettingsRow label="Open it again" onPress={reopen} />
        )}
        <SettingsRow icon="delete" label="Delete goal" destructive onPress={remove} />
      </SettingsSection>
    </AppScreen>
  );
}

/**
 * The ask — the one thing on this screen that is about today.
 *
 * A dateline, the claim, and the per-day division under it, because this is a sentence about a
 * span, not a stat.
 */
function Ask({ reading }: { reading: GoalReading }) {
  const { goal, quota, quotaRemaining, dailyTarget, met, overdue, acts } = reading;
  const contributor = acts.find((a) => a.contributes) ?? null;

  let claim: string;
  let under: string | null = null;
  if (met || goal.status === 'reached') {
    claim = `All ${formatMeasure(goal.target_value)} ${goal.unit}.`;
    under = 'Reached.';
  } else if (goal.status === 'released') {
    claim = 'Set aside.';
    under = 'It keeps its record, and asks nothing of the month.';
  } else if (quota === null) {
    claim = `${formatMeasure(reading.remaining)} ${goal.unit} to go.`;
  } else if (quotaRemaining === 0) {
    claim = 'This month is settled.';
    under = `${formatMeasure(quota)} ${goal.unit} asked for, and done.`;
  } else {
    claim = `${formatMeasure(quotaRemaining)} ${goal.unit} left this month.`;
    if (dailyTarget !== null && contributor) under = `About ${formatMeasure(dailyTarget)} a day from here.`;
  }

  return (
    <Surface padded>
      <View style={styles.ask}>
        <ThemedText type="small" themeColor="textSecondary">
          {overdue ? 'Past its horizon' : `${reading.monthsLeft === 0 ? 'The last month' : `${reading.monthsLeft + 1} months`}`}
        </ThemedText>
        <ThemedText type="claim">{claim}</ThemedText>
        {under ? (
          <ThemedText type="small" themeColor="textSecondary">
            {under}
          </ThemedText>
        ) : null}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  ask: { gap: Spacing.one },
});
