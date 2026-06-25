/**
 * Local weekly habit reminders.
 *
 * `expo-notifications` (and the date picker it pairs with) are native modules that are
 * NOT in Expo Go (SDK 53+), and an OTA update can't add native code to an existing
 * build. So we load the module defensively: never in Expo Go (its import throws there),
 * and tolerating its absence in any build that predates the dependency. `remindersAvailable`
 * reflects whether it actually loaded, and the editor hides the reminder control when it
 * didn't — so reminders light up only in a build that bundled the native module.
 *
 * No local state is kept: {@link rescheduleAll} cancels everything and rebuilds from the
 * current habits, so the OS schedule always mirrors the database.
 */
import { Platform } from 'react-native';

import { parseReminderTime } from '@/lib/dates';

/** The fields a reminder needs from a habit. `Habit` satisfies this structurally. */
type RemindableHabit = {
  name: string;
  reminder_time: string | null;
  schedule_days: number[];
};

type NotificationsModule = any;

function loadModule(): NotificationsModule | null {
  // TEMP (iOS launch-hang isolation build): expo-notifications is removed from the
  // build entirely to rule out its native module / entitlement as the launch blocker.
  // Always report unavailable so reminders degrade gracefully and Metro never tries
  // to resolve the (now absent) `expo-notifications` module.
  return null;
}

const N = loadModule();

/** True only in a build that actually bundled the notifications native module. */
export const remindersAvailable = N !== null;

let configured = false;

/** Foreground-display behaviour + Android channel. Idempotent; call once at startup. */
export async function configureNotifications(): Promise<void> {
  if (!N || configured) return;
  configured = true;

  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('default', {
      name: 'Reminders',
      importance: N.AndroidImportance.HIGH,
    });
  }
}

/**
 * Current notification permission, *without* prompting — for reflecting state on mount.
 * `true`/`false` when known; `null` when notifications aren't available at all.
 */
export async function permissionGranted(): Promise<boolean | null> {
  if (!N) return null;
  const { status } = await N.getPermissionsAsync();
  return status === 'granted';
}

/** Request notification permission if needed. Returns true when granted (false when unavailable). */
export async function ensurePermission(): Promise<boolean> {
  if (!N) return false;
  const { status } = await N.getPermissionsAsync();
  if (status === 'granted') return true;
  const { status: next } = await N.requestPermissionsAsync();
  return next === 'granted';
}

/**
 * Cancel all scheduled reminders and rebuild them from `habits`. Best-effort and a
 * no-op when notifications are unavailable; never throws into the caller.
 */
export async function rescheduleAll(habits: RemindableHabit[]): Promise<void> {
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
    for (const habit of habits) {
      const time = parseReminderTime(habit.reminder_time);
      if (!time) continue;
      for (const day of habit.schedule_days) {
        await N.scheduleNotificationAsync({
          content: { title: habit.name, body: `Time for ${habit.name}` },
          trigger: {
            type: N.SchedulableTriggerInputTypes.WEEKLY,
            // expo weekday is 1=Sunday…7=Saturday; our schedule_days is 0=Sunday…6=Saturday.
            weekday: day + 1,
            hour: time.hour,
            minute: time.minute,
          },
        });
      }
    }
  } catch {
    // Scheduling can fail when permission is denied — reminders just won't fire.
  }
}
