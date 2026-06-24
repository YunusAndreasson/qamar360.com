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
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { parseReminderTime } from '@/lib/dates';

/** The fields a reminder needs from a habit. `Habit` satisfies this structurally. */
type RemindableHabit = {
  name: string;
  reminder_time: string | null;
  schedule_days: number[];
};

// We need the module's *type* without a runtime import — a static `import` would evaluate
// expo-notifications and crash Expo Go (its native module is absent there).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type NotificationsModule = typeof import('expo-notifications');

function loadModule(): NotificationsModule | null {
  // Expo Go strips the native module — requiring it there throws and crashes the app.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null; // a build that predates the dependency (e.g. an OTA onto an older binary)
  }
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
