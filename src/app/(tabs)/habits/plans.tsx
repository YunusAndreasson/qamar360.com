import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { AppScreen } from '@/components/app-screen';
import { EmptyState } from '@/components/empty-state';
import { ErrorBanner } from '@/components/error-banner';
import { SettingsRow } from '@/components/settings-row';
import { SettingsSection } from '@/components/settings-section';
import { Skeleton } from '@/components/skeleton';
import { useHabitsNavigation } from '@/hooks/use-habits';
import { usePlans } from '@/hooks/use-plans';
import { useTasks } from '@/hooks/use-tasks';
import { planMeta } from '@/lib/plans';

/**
 * Plans — what you mean to do, before any of it has a day.
 *
 * The day's three cards each hold something anchored in time. This is the list of what isn't: a
 * trip, a shed, a visit you keep meaning to make. Each is a title and the notes behind it, and the
 * notes are the point — "Denmark with the family" is worth writing down because of the ten lines
 * under it, not the four words at the top.
 *
 * It is a place rather than a card on Today, because a list with no day on it has no business
 * competing with the day. The way in is the "+", beside the to-do it is the undated cousin of.
 *
 * A plan is never ticked here. You pull a **to-do** out of it onto today or tomorrow and the plan
 * stays, because one trip yields several to-dos over several weeks — so the row's second line says
 * where the last one went, and the notes step aside to make room for that.
 */
export default function PlansScreen() {
  const router = useRouter();
  const { plans, loading, error, dismissError, refresh } = usePlans();
  const { scheduledPlans } = useTasks();
  const { today } = useHabitsNavigation();

  // Plans are edited on the web too, so the list re-reads itself whenever it comes forward rather
  // than trusting what the provider loaded when the app started.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return (
    <AppScreen>
      <ErrorBanner message={error} onDismiss={dismissError} />
      {loading ? (
        <Skeleton height={220} />
      ) : plans.length === 0 ? (
        <EmptyState
          icon="plan"
          title="Nothing planned"
          body="Somewhere to keep the things you mean to do, before they have a day."
        />
      ) : (
        <SettingsSection>
          {plans.map((plan) => (
            <SettingsRow
              key={plan.id}
              icon="plan"
              label={plan.title}
              // The notes, or where the to-do went. `?? undefined` because the row's prop is
              // optional and `planMeta` answers `null` for a plan that is still only a name.
              sublabel={planMeta({ body: plan.body, scheduledOn: scheduledPlans.get(plan.id) ?? null, today }) ?? undefined}
              // A chevron, not a "⋯": tapping this opens the notes, and a chevron is the glyph
              // this app reserves for "there is more of this to read".
              showChevron
              onPress={() => router.push({ pathname: '/habits/plan', params: { id: plan.id } })}
            />
          ))}
        </SettingsSection>
      )}
      <SettingsSection>
        <SettingsRow icon="add" label="Add a plan" onPress={() => router.push('/habits/plan')} />
      </SettingsSection>
    </AppScreen>
  );
}
