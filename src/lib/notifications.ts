/**
 * Local habit reminders — weekly recurring triggers, plus one-shot dated triggers for
 * Hijri-scheduled habits (which have no weekly equivalent).
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

import { addDaysISO, type HijriSchedule, parseReminderTime, scheduledOn, todayLocalISO } from '@/lib/dates';

/** The fields a reminder needs from a habit. `Habit` satisfies this structurally. */
type RemindableHabit = {
  name: string;
  reminder_time: string | null;
  schedule_days: number[];
  hijri_schedule?: HijriSchedule | null;
  created_at: string | null;
};

/**
 * A Hijri habit has no weekly trigger, so we arm its next few occurrences as one-shot DATE
 * triggers — scanning this far ahead, capped to this many (re-armed whenever habits change).
 */
const HIJRI_HORIZON_DAYS = 120;
const HIJRI_MAX_OCCURRENCES = 6;
const IOS_BADGE_PERMISSION = { ios: { allowAlert: true, allowBadge: true, allowSound: true } };

/** A Date at `hour:minute` local time on the given `YYYY-MM-DD` day. */
function atLocalTime(iso: string, hour: number, minute: number): Date {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute, 0, 0);
}

function weeklyDueCount(habits: RemindableHabit[], weekday: number): number {
  return habits.filter((habit) => !habit.hijri_schedule && habit.schedule_days.includes(weekday)).length;
}

function dailyDueCount(habits: RemindableHabit[], iso: string): number {
  return habits.filter((habit) => scheduledOn(habit, iso)).length;
}

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
      shouldSetBadge: true,
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
  const current = await N.getPermissionsAsync();
  if (current.status === 'granted' && (Platform.OS !== 'ios' || current.ios?.allowsBadge !== false)) return true;
  const { status: next } = await N.requestPermissionsAsync(IOS_BADGE_PERMISSION);
  return next === 'granted';
}

/** Set the home-screen app icon badge. Best-effort: unsupported launchers simply ignore it. */
export async function setAppBadgeCount(count: number): Promise<void> {
  if (!N) return;
  try {
    await N.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // Some Android launchers do not support badges, and permission can be denied on iOS.
  }
}

/**
 * Cancel all scheduled reminders and rebuild them from `habits`. Best-effort and a
 * no-op when notifications are unavailable; never throws into the caller.
 */
export async function rescheduleAll(habits: RemindableHabit[]): Promise<void> {
  if (!N) return;
  try {
    await N.cancelAllScheduledNotificationsAsync();
    const now = new Date();
    const todayISO = todayLocalISO(now);
    for (const habit of habits) {
      const time = parseReminderTime(habit.reminder_time);
      if (!time) continue;

      // Hijri habits: arm the next few dated occurrences (there is no weekly equivalent).
      if (habit.hijri_schedule) {
        let armed = 0;
        for (let i = 0; i <= HIJRI_HORIZON_DAYS && armed < HIJRI_MAX_OCCURRENCES; i += 1) {
          const dayISO = addDaysISO(todayISO, i);
          if (!scheduledOn(habit, dayISO)) continue;
          const when = atLocalTime(dayISO, time.hour, time.minute);
          if (when.getTime() <= now.getTime()) continue; // today's slot already passed
          await N.scheduleNotificationAsync({
            content: { title: habit.name, body: `Time for ${habit.name}`, badge: dailyDueCount(habits, dayISO) },
            trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: when },
          });
          armed += 1;
        }
        continue;
      }

      // Weekly habits: one recurring trigger per scheduled weekday.
      for (const day of habit.schedule_days) {
        await N.scheduleNotificationAsync({
          content: { title: habit.name, body: `Time for ${habit.name}`, badge: weeklyDueCount(habits, day) },
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
