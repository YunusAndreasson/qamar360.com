/**
 * Lunar updates — the app's only notifications.
 *
 * Four a lunar month, one per quarter of the moon, each carrying where the month is and where
 * the user is in it. What they say is decided by {@link lunar-update.ts}; when they fire by
 * {@link lunar-schedule.ts}. This module is only the transport: permission, the Android
 * channel, the moon image, and arming the OS.
 *
 * `expo-notifications` is loaded defensively because an OTA update can't add native code to an
 * existing build. `notificationsAvailable` reflects whether the module actually loaded, and
 * the Settings screen shows the feature as unavailable when it did not. The same reasoning
 * applies to the two modules the iOS attachment needs, so those are required lazily too — a
 * missing one costs the update its picture, never the update.
 *
 * No local state is kept: {@link scheduleLunarUpdates} cancels everything and rebuilds from
 * the list it is handed, so the OS schedule always mirrors what the app last computed.
 */
import { Platform } from 'react-native';

import { MOON_ASSETS } from '@/constants/moon-assets';
import { Colors } from '@/constants/theme';

/** The Android channel these arrive on. */
const CHANNEL_ID = 'lunar';
/**
 * The channel per-habit reminders used, at HIGH importance. A channel's importance can't be
 * changed once created, so the replacement needs a new id — and this one has to be deleted or
 * users keep an orphaned "Reminders" entry in system settings forever.
 */
const RETIRED_CHANNEL_ID = 'default';

/** Where a moon image is staged before iOS takes it (see {@link stageMoon}). */
const MOON_CACHE_DIR = 'lunar-moons';

/** Marks a notification as ours, so a tap can be told apart from anything else's. */
const LUNAR_KIND = 'lunar';

const IOS_PERMISSION = { ios: { allowAlert: true, allowBadge: true, allowSound: true } };

// We need the module's *type* without a runtime import — a static import would eagerly evaluate
// expo-notifications in an older OTA target whose binary may not contain the native module.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type NotificationsModule = typeof import('expo-notifications');

function loadModule(): NotificationsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications') as NotificationsModule;
  } catch {
    return null; // a build that predates the dependency (e.g. an OTA onto an older binary)
  }
}

const N = loadModule();

/** True only in a build that actually bundled the notifications native module. */
export const notificationsAvailable = N !== null;

/** One update, resolved and ready to arm. */
export type PlannedUpdate = {
  /** When to fire. Already checked to be in the future by the planner. */
  at: Date;
  title: string;
  body: string;
  /** Which bundled moon to attach — a key of {@link MOON_ASSETS}. iOS only. */
  assetKey: string;
  /** The quarterly reading this update announces, when it carries one. Rides in the payload so
   *  the tap can open that reading rather than the feed it sits at the top of. */
  readingId?: string;
};

let configured = false;

/** Foreground-display behaviour + Android channel. Idempotent; call once at startup. */
export async function configureNotifications(): Promise<void> {
  if (!N || configured) return;
  configured = true;

  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      // A lunar update is a thing to reflect on, not an alarm — and in the foreground the user
      // is already holding the app that would answer it.
      shouldPlaySound: false,
      // The foreground badge is owned by the app's live "open today" effect (use-habits), so a
      // firing update must never touch it. Nothing here sets `badge` either.
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    try {
      await N.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Lunar updates',
        description: 'Four times a lunar month, at each quarter of the moon.',
        importance: N.AndroidImportance.DEFAULT,
        showBadge: false,
        lightColor: Colors.dark.accent,
      });
      // Only once the replacement exists, so a failure between the two leaves the user with a
      // working channel rather than none.
      await N.deleteNotificationChannelAsync(RETIRED_CHANNEL_ID);
    } catch {
      // Channel setup failed — drop the latch so a later call can retry (the handler re-set
      // above is idempotent), and never let the rejection escape the fire-and-forget startup call.
      configured = false;
    }
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
  const { status: next } = await N.requestPermissionsAsync(IOS_PERMISSION);
  return next === 'granted';
}

/** Set the home-screen app icon badge. Best-effort: unsupported launchers simply ignore it. */
export async function setAppBadgeCount(count: number): Promise<void> {
  if (!N) return;
  try {
    await N.setBadgeCountAsync(count);
  } catch {
    // Some Android launchers do not support badges, and permission can be denied on iOS.
  }
}

/**
 * A `file://` URI for the moon of `assetKey`, staged in the cache directory — or `null` if it
 * can't be produced.
 *
 * The copy is not incidental. `UNNotificationAttachment` *moves* the file it is given into its
 * own data store, and the bundled asset it would otherwise be handed lives in the read-only app
 * bundle. Handing iOS a disposable copy is what makes the attachment work at all.
 *
 * Android has no equivalent: `expo-notifications` exposes no image field for a local
 * notification there (`attachments` is iOS-only), so this is never called on Android.
 */
async function stageMoon(assetKey: string): Promise<string | null> {
  const moduleId = MOON_ASSETS[assetKey];
  if (moduleId === undefined) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
    const { Asset } = require('expo-asset') as typeof import('expo-asset');
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports
    const { Directory, File, Paths } = require('expo-file-system') as typeof import('expo-file-system');

    const dir = new Directory(Paths.cache, MOON_CACHE_DIR);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

    const staged = new File(dir, `${assetKey}.png`);
    if (staged.exists) return staged.uri; // a previous run's copy; the image never changes

    const asset = await Asset.fromModule(moduleId).downloadAsync();
    if (!asset.localUri) return null;
    await new File(asset.localUri).copy(staged, { overwrite: true });
    return staged.uri;
  } catch {
    return null; // no picture is a fine outcome; a thrown scheduler is not
  }
}

/** The last tap already acted on — the cold-start read and the live listener can both surface
 *  the same response, and two navigations would stack the same screen twice. */
let handledTapId: string | null = null;

function lunarTap(response: { notification: { request: { identifier: string; content: { data?: unknown } } } } | null) {
  const data = response?.notification.request.content.data as { kind?: string; readingId?: string } | undefined;
  if (data?.kind !== LUNAR_KIND) return null;
  return { id: response!.notification.request.identifier, readingId: data.readingId ?? null };
}

/**
 * Run `open` when the user taps a lunar update — including the tap that cold-started the app,
 * which arrives through a different API than a tap while it is running. Returns an unsubscribe.
 *
 * This is the other half of the feature: the tray carries a quarter's reading, and the tap lands
 * on that reading in full. `readingId` is null on an update that carried only the landmark (no
 * reading was published, or it was held back) — the caller then opens the feed.
 */
export function subscribeToUpdateTaps(open: (readingId: string | null) => void): () => void {
  if (!N) return () => {};
  let active = true;

  const handle = (tap: { id: string; readingId: string | null } | null) => {
    if (!active || !tap || tap.id === handledTapId) return;
    handledTapId = tap.id;
    open(tap.readingId);
  };

  // The tap that launched the app. Cleared so a later relaunch doesn't replay it.
  void N.getLastNotificationResponseAsync()
    .then((response) => {
      const tap = lunarTap(response);
      if (tap) void N.clearLastNotificationResponseAsync().catch(() => {});
      handle(tap);
    })
    .catch(() => {
      // No launch response to read — nothing to open.
    });

  const sub = N.addNotificationResponseReceivedListener((response) => handle(lunarTap(response)));
  return () => {
    active = false;
    sub.remove();
  };
}

/** Monotonic run counter — a newer call supersedes queued/running ones. */
let scheduleEpoch = 0;
/** Tail of the schedule queue — runs execute strictly one at a time (never rejects). */
let scheduleQueue: Promise<void> = Promise.resolve();

/**
 * Cancel everything armed and rebuild from `updates`. Pass `[]` to simply clear. Best-effort
 * and a no-op when notifications are unavailable; never throws into the caller.
 *
 * Runs are serialized (queued) and superseded by epoch. Without this, two overlapping runs
 * interleave — run B's cancel-all lands mid-way through run A's schedule loop, then A resumes
 * and arms its remaining STALE updates after B's fresh set. The queue makes overlap impossible;
 * the epoch makes a superseded run yield promptly, and the newest run's own cancel-all sweeps
 * anything an interrupted run had already armed.
 */
export function scheduleLunarUpdates(updates: PlannedUpdate[]): Promise<void> {
  if (!N) return Promise.resolve();
  const epoch = ++scheduleEpoch;
  const run = scheduleQueue.then(() => (epoch === scheduleEpoch ? rebuild(updates, epoch) : undefined));
  scheduleQueue = run;
  return run;
}

async function rebuild(updates: PlannedUpdate[], epoch: number): Promise<void> {
  if (!N) return;
  try {
    // Idempotent, and cheap after the first call — but an Android trigger naming a channel that
    // doesn't exist yet is rejected, and the startup call could still be in flight on a fast load.
    await configureNotifications();
    await N.cancelAllScheduledNotificationsAsync();
    const { status } = await N.getPermissionsAsync();
    if (status !== 'granted') return;
  } catch {
    return; // without a clean slate, rebuilding could leave duplicate/stale updates
  }

  const now = Date.now();
  for (const update of updates) {
    if (epoch !== scheduleEpoch) return; // superseded — the newer run owns the schedule
    if (update.at.getTime() <= now) continue; // a plan that went stale while queued
    const moonUri = Platform.OS === 'ios' ? await stageMoon(update.assetKey) : null;
    if (epoch !== scheduleEpoch) return;
    try {
      await N.scheduleNotificationAsync({
        content: {
          title: update.title,
          body: update.body,
          // Audible on the lock screen — four a month that nobody hears is four wasted. The
          // *foreground* handler is the one that stays silent.
          color: Colors.dark.accent,
          data: { kind: LUNAR_KIND, ...(update.readingId ? { readingId: update.readingId } : null) },
          ...(moonUri ? { attachments: [{ identifier: update.assetKey, url: moonUri, type: 'public.png' }] } : null),
        },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: update.at, channelId: CHANNEL_ID },
      });
    } catch {
      // Keep going: one rejected trigger should not silence the rest of the month.
    }
  }
}
