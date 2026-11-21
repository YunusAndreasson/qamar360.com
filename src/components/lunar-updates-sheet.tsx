import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { FormSheet } from '@/components/form-sheet';
import { MoonPhase } from '@/components/moon-phase';
import { ThemedText } from '@/components/themed-text';
import { ANALYTICS_EVENTS, type PermissionSource } from '@/constants/analytics';
import { Spacing } from '@/constants/theme';
import { analytics } from '@/lib/analytics';
import { MILESTONE_DAYS, phaseOf } from '@/lib/lunar-phase';
import { ensurePermission, markLunarUpdatesOffered, permissionGranted, setLunarUpdates } from '@/lib/notifications';

/** A representative month, purely so the four moons are drawn at the shapes they'll arrive at. */
const SAMPLE_MONTH_LENGTH = 30;

const WHAT_ARRIVES: Record<number, string> = {
  1: 'A new month begins',
  8: 'A quarter of the way',
  15: 'Halfway: the White Days',
  22: 'The final stretch',
};

/**
 * What the four lunar updates are, shown before the OS ever asks.
 *
 * iOS grants exactly one permission prompt per install, and a dialog arriving out of nowhere is
 * the surest way to spend it on a "no". So the ask is explained first, in the app's own moons —
 * the same {@link MoonPhase} the Progress hero draws, so a user recognises on the lock screen
 * the thing they agreed to here.
 *
 * Two doors lead here: the Lunar updates switch in Settings, and the first closed day after which
 * the updates still cannot arrive (see `DayCompleteProvider`). The second is the app's own idea,
 * not the user's, so it says "Not now" out loud; closing the sheet any way is the same answer, and
 * the app does not ask again on its own.
 */
export function LunarUpdatesSheet({ source }: { source: PermissionSource }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const answered = useRef(false);

  // Shown: remembered for good, and the primer counted. Closed without Continue, it was declined
  // before the OS was ever involved.
  useEffect(() => {
    markLunarUpdatesOffered();
    const context = { permission: 'notifications', primed: true, source };
    void analytics.track(ANALYTICS_EVENTS.PERMISSION_PROMPT_SHOWN, { ...context, dialog: 'primer' });
    return () => {
      if (answered.current) return;
      void permissionGranted().then(
        (granted) => analytics.track(ANALYTICS_EVENTS.PERMISSION_RESULT, { ...context, granted: granted === true, prompted: false }),
        () => undefined,
      );
    };
  }, [source]);

  const allow = async () => {
    if (asking) return;
    answered.current = true;
    setAsking(true);
    await ensurePermission({ primed: true, source });
    // Set regardless of the answer. The preference records what the *user* wants; whether the
    // OS is currently allowing it is a separate fact, and the Settings row underneath spells it
    // out ("System notifications · Blocked in system settings", tappable through to them).
    // Reverting the switch on a denial instead would leave a toggle that silently sprang back.
    setLunarUpdates(true);
    router.back();
  };

  return (
    <FormSheet title="Four nights a lunar month" subtitle="At each quarter of the moon, and nothing else">
      <View style={styles.rows}>
        {MILESTONE_DAYS.map((day) => {
          const { label, illumination, waxing } = phaseOf(day, SAMPLE_MONTH_LENGTH);
          return (
            <View key={day} style={styles.row}>
              <MoonPhase illumination={illumination} waxing={waxing} size={28} />
              <View style={styles.rowText}>
                <ThemedText type="rowTitle">{label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {WHAT_ARRIVES[day]}
                </ThemedText>
              </View>
            </View>
          );
        })}
      </View>

      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        Each one says where the month stands, in degrees, and opens Progress. No daily reminders.
      </ThemedText>

      <AppButton onPress={() => void allow()} busy={asking}>
        Continue
      </AppButton>
      {source === 'first_day_completed' ? (
        <AppButton variant="secondary" onPress={() => router.back()} disabled={asking}>
          Not now
        </AppButton>
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  rows: { gap: Spacing.three, paddingHorizontal: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  rowText: { flex: 1, gap: Spacing.half },
  note: { paddingHorizontal: Spacing.one },
});
