import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ErrorBanner } from '@/components/error-banner';
import { FormField } from '@/components/form-field';
import { formHeaderActions } from '@/components/form-header-actions';
import { FormScreen } from '@/components/form-screen';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { Spacing } from '@/constants/theme';
import { useBackIfStale } from '@/hooks/use-back-if-stale';
import { useHabitsNavigation } from '@/hooks/use-habits';
import { usePlans } from '@/hooks/use-plans';
import { useTasks } from '@/hooks/use-tasks';
import { confirmDestructive } from '@/lib/alerts';
import { addDaysISO } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { scheduledLabel } from '@/lib/plans';
import type { Task } from '@/lib/tasks';

/** The ceiling the column checks. */
const MAX_BODY_LENGTH = 4000;

/**
 * One plan: what it is, and the notes behind it.
 *
 * Pushed inside the Plans modal rather than presented over it, for the reason the guides are —
 * this wants a back button and a title of its own, and a second sheet on top of the first is how
 * a stack of modals starts.
 *
 * The notes field is the point of the screen, so it is given the screen. A to-do could not have
 * this and shouldn't: a one-off is a line you type, and a form
 * asking for notes about it would be asking for work the thing doesn't have.
 *
 * Below the fields, the one thing a plan can do: put a to-do on today or on tomorrow. That row is
 * its own confirmation — it stops being a button and starts reading "On tomorrow's list", under
 * the finger that pressed it — so nothing else has to announce what happened.
 */
export default function PlanScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { plans, loading, error, dismissError, createPlan, updatePlan, deletePlan } = usePlans();
  const {
    openTasks,
    createTask,
    error: taskError,
    dismissError: dismissTaskError,
  } = useTasks();
  const { today } = useHabitsNavigation();

  const plan = id ? plans.find((p) => p.id === id) : undefined;
  // Opened for a plan that has since been deleted — from the web, or from this screen itself.
  useBackIfStale(Boolean(id) && !loading && plan === undefined);

  // The fields are **derived**, not seeded: `null` means untouched, and an untouched field shows
  // whatever the plan currently holds. Copying the plan into state at mount would leave both
  // fields empty on any path that arrives before the list has loaded — a cold start, a deep link —
  // and copying it in an effect is what `react-hooks/set-state-in-effect` refuses. Once something
  // is typed the draft wins outright, so a refresh landing behind this screen (or an edit made on
  // the web) can never reach in and replace what is being written.
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const title = draftTitle ?? plan?.title ?? '';
  const body = draftBody ?? plan?.body ?? '';

  const cleanTitle = title.trim();
  const changed = cleanTitle !== (plan?.title ?? '') || body.trim() !== (plan?.body ?? '');
  const canSave = cleanTitle.length > 0 && changed && !saving;

  /** Commit whatever is in the fields. Answers with the plan's id, or null if nothing was stored. */
  const persist = async (): Promise<string | null> => {
    if (!cleanTitle) return null;
    if (!plan) return (await createPlan(title, body))?.id ?? null;
    if (!changed) return plan.id;
    return (await updatePlan(plan.id, { title, body })) ? plan.id : null;
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const savedId = await persist();
    setSaving(false);
    // Stay put on failure: the banner says why, and the text is still here to try again with.
    if (savedId) router.back();
  };

  /**
   * Put a to-do on `day`, carrying this plan's id so the plan can say afterwards where it went.
   *
   * Any unsaved edit is committed first: the to-do takes the plan's title, and writing one from a
   * title still being typed would put a name on a day that exists nowhere else.
   */
  const schedule = async (day: string) => {
    setSaving(true);
    const planId = await persist();
    // A second tap inside the same frame is refused by the task provider, which keys an in-flight
    // guard on the plan and day — the one place that can see both halves of "the same to-do".
    if (planId && (await createTask(cleanTitle, { day, planId }))) haptics.added();
    setSaving(false);
  };

  const remove = () => {
    if (!plan) return;
    confirmDestructive({
      title: 'Delete plan',
      // Said plainly, because it is the one thing a reader would otherwise have to guess: the
      // to-dos this plan has already put on a day are days you committed to, and they stay.
      message: `Delete “${plan.title}”? Anything it has already put on a list stays there.`,
      onConfirm: () => {
        void (async () => {
          if (await deletePlan(plan.id)) router.back();
        })();
      },
    });
  };

  // Every open to-do this plan has put out, not just the soonest: a plan can hold one on today and
  // another on tomorrow, and each row has to answer for its own day.
  const mine = plan ? openTasks.filter((task) => task.plan_id === plan.id) : [];
  const tomorrow = addDaysISO(today, 1);

  return (
    <FormScreen keyboardDismissMode="interactive">
      <Stack.Screen
        options={{
          title: plan ? 'Plan' : 'New plan',
          headerTitleAlign: 'center',
          ...formHeaderActions({ onCancel: () => router.back(), onSave: () => void save(), canSave, saveLabel: plan ? 'Save' : 'Create' }),
        }}
      />
      {/* Two providers can fail here and the reader does not care which: saving the plan is
          `usePlans`, putting it on a day is `useTasks`. A failed schedule rolls its own row back
          and reports through the task provider, so without its banner the tap does nothing at all
          and says nothing — and the obvious response to that is to tap again. */}
      <ErrorBanner message={error} onDismiss={dismissError} />
      <ErrorBanner message={taskError} onDismiss={dismissTaskError} />
      <FormField
        label="Title"
        value={title}
        onChangeText={setDraftTitle}
        placeholder="What is it?"
        accessibilityLabel="Title"
        autoFocus={!plan}
        autoCapitalize="sentences"
        maxLength={200}
      />
      <FormField
        label="Notes"
        value={body}
        onChangeText={setDraftBody}
        placeholder="Anything worth remembering about it."
        hint={`${body.length}/${MAX_BODY_LENGTH}`}
        accessibilityLabel="Notes"
        multiline
        maxLength={MAX_BODY_LENGTH}
        textAlignVertical="top"
        style={styles.notes}
      />
      {plan ? (
        <>
          <SettingsSection
            title="Add as a to-do"
            footer="A to-do put on tomorrow appears on the day itself. The plan stays here either way.">
            <ScheduleRow label="Today" day={today} today={today} scheduled={mine} disabled={saving} onPress={schedule} />
            <ScheduleRow
              label="Tomorrow"
              day={tomorrow}
              today={today}
              scheduled={mine}
              disabled={saving}
              onPress={schedule}
            />
          </SettingsSection>
          <SettingsSection>
            <SettingsRow icon="delete" label="Delete plan" destructive onPress={remove} />
          </SettingsSection>
        </>
      ) : null}
    </FormScreen>
  );
}

/**
 * One day you can put this plan on.
 *
 * Once something is already there the row stops being a control: `SettingsRow` renders a plain
 * `View` when it is given no `onPress`, so the row that said "Today" now reads "Today · On today's
 * list" and cannot be pressed into writing a second copy of itself.
 */
function ScheduleRow({
  label,
  day,
  today,
  scheduled,
  disabled,
  onPress,
}: {
  label: string;
  day: string;
  today: string;
  /** Every open to-do this plan has put out. */
  scheduled: Task[];
  disabled: boolean;
  onPress: (day: string) => void;
}) {
  // An open to-do at or before today is showing on today (the carry-forward in `tasks.showsOn`),
  // so it is today's row that is taken, not the day it was originally written for.
  const held = scheduled.find((task) => (day === today ? task.due_on <= today : task.due_on === day));
  return (
    <SettingsRow
      icon="task"
      label={label}
      value={held ? scheduledLabel(held.due_on, today) : undefined}
      onPress={held || disabled ? undefined : () => onPress(day)}
    />
  );
}

const styles = StyleSheet.create({
  // Enough that the notes are the screen rather than a field on it.
  notes: { minHeight: 240, paddingTop: Spacing.three },
});
