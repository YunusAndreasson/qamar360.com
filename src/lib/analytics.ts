/**
 * Mixpanel, lazily initialised and silent.
 *
 * Analytics is never allowed to break the app: a missing token (development, tests), a failed
 * init, a network error or an SDK throw all resolve as a no-op. Nothing here throws or logs.
 *
 * Anonymous by design: there is no `identify` and no people profile. `reset` on sign-out and
 * account deletion starts a fresh anonymous id, so two accounts on one device do not share one.
 * What describes the install rather than the account (the super properties, `install_id`, the
 * First Open, which events it has already sent once) outlives that reset: the super properties are
 * kept here and put back after it, and the rest is stored on the device.
 *
 * INSTALL ATTRIBUTION (plans/install-attribution-2026-11.md in the assistant repo)
 * ===================
 * Marketer follows an install from the ad or link that brought it to its activation, through
 * Mixpanel alone. `install_id` (random, on the device) is on every event, registered at
 * initialisation and again after `reset`, so it is there before a launch's first event. `First
 * Open` says `install_kind`. Then, once per install and only for one that began with this code:
 * `Install Attribution` (Android: the raw Play install referrer, in `referrer_0..N`) and
 * `Activated` (the first {@link ACTIVATION_TRIGGER}, with no properties of its own). An install
 * from before this code has both spent without sending either. A flag is written before its event
 * is sent, so a crash between the two loses one event and never sends one twice.
 *
 * `install_id` lives in this module and goes to Mixpanel only: never to Sentry, Supabase or any
 * other service, where it would join what each knows.
 */
import * as Application from 'expo-application';
import { Platform } from 'react-native';

import {
  ACTIVATION_TRIGGER,
  ANALYTICS_EVENTS,
  FIRST_TIME_EVENTS,
  MIXPANEL_SERVER_URL,
  MIXPANEL_TOKEN,
  type AnalyticsEventName,
  type AuthMethod,
  type HabitCountBucket,
  type SuperProperties,
} from '@/constants/analytics';
import { todayLocalISO } from '@/lib/dates';
import { newId } from '@/lib/id';
import { getWebStorage, readStoredJSON, writeStoredJSON } from '@/lib/web-storage';

import type { User } from '@supabase/supabase-js';
import type * as MixpanelModule from 'mixpanel-react-native';

// Narrower than the SDK's permissive property values.
type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

/** Every super property registered this run — what `reset` puts back. */
let registered: SuperProperties = {};

/**
 * The install's First Open, stored once: its day, and whether the install already had a session.
 * The once-per-install attribution flags say whether each is still owed (false) or settled (true:
 * sent, given up on, or never owed). A record written before they existed has none, and counts as
 * settled: its First Open went out without `install_id` or `install_kind`, so marketer has no
 * install to hang either on.
 */
type InstallRecord = {
  date: string;
  existing: boolean;
  installAttributionSent?: boolean;
  /** Install referrer reads begun, each counted before it is made. */
  referrerReads?: number;
  activatedSent?: boolean;
};
const INSTALL_KEY = 'analytics.install.v1';
/** Keys this install has already sent: an event name for `first_time`, `once:<key>` for `trackOnce`. */
const SEEN_KEY = 'analytics.seen.v1';
/** This install's `install_id`, a bare UUID string. */
const INSTALL_ID_KEY = 'analytics.install-id.v1';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const readInstall = (): InstallRecord | null => {
  const install = readStoredJSON<Partial<InstallRecord>>(INSTALL_KEY);
  return install && typeof install.date === 'string' && typeof install.existing === 'boolean'
    ? (install as InstallRecord)
    : null;
};

/** `install_date` is only a cohort for an install that began with this build; an update has none. */
const installProperties = (): SuperProperties => {
  const install = readInstall();
  return install && !install.existing ? { install_date: install.date } : {};
};

/** Kept for the launch once known, so a failed write cannot give one launch two ids. */
let installIdThisLaunch: string | null = null;

/**
 * This install's `install_id`, made and stored the first time it is asked for. Null when the
 * storage is missing or cannot be read: a new id then could replace the one that joins everything.
 * A failed write keeps the new id for this launch; the next one makes another.
 */
const installId = (): string | null => {
  if (installIdThisLaunch) return installIdThisLaunch;
  const storage = getWebStorage();
  if (!storage) return null;
  let stored: string | null;
  try {
    stored = storage.getItem(INSTALL_ID_KEY);
  } catch {
    return null;
  }
  if (stored && UUID_PATTERN.test(stored)) {
    installIdThisLaunch = stored;
    return stored;
  }
  const made = newId();
  try {
    storage.setItem(INSTALL_ID_KEY, made);
  } catch {
    // Kept for this launch only.
  }
  installIdThisLaunch = made;
  return made;
};

const superProperties = (): SuperProperties => {
  const id = installId();
  return { ...installProperties(), ...registered, ...(id ? { install_id: id } : {}) };
};

const readSeen = (): string[] => {
  const seen = readStoredJSON<unknown>(SEEN_KEY);
  return Array.isArray(seen) ? seen.filter((key): key is string => typeof key === 'string') : [];
};

/** True the first time `key` is asked about on this install, and never again. */
const firstTime = (key: string): boolean => {
  const seen = readSeen();
  if (seen.includes(key)) return false;
  writeStoredJSON(SEEN_KEY, [...seen, key]);
  return true;
};

let mixpanelInstance: MixpanelModule.Mixpanel | null = null;

const startMixpanel = async (token: string): Promise<void> => {
  // Required lazily so tests and a token-less build never load the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Mixpanel } = require('mixpanel-react-native') as typeof MixpanelModule;
  const trackAutomaticEvents = false;
  const instance = new Mixpanel(token.trim(), trackAutomaticEvents);
  const optOutTrackingDefault = false;
  await instance.init(optOutTrackingDefault, superProperties(), MIXPANEL_SERVER_URL);
  // Published only once initialised.
  mixpanelInstance = instance;
};

/**
 * The one initialisation in flight or done. A promise, not a flag: a flag set only once `init()`
 * resolved let concurrent first calls each see it unset and each build their own instance.
 */
let initialization: Promise<void> | null = null;

const initializeMixpanel = (): Promise<void> => {
  if (!MIXPANEL_TOKEN) return Promise.resolve();
  initialization ??= startMixpanel(MIXPANEL_TOKEN).catch(() => {
    // Forgotten, so the next call tries again.
    initialization = null;
  });
  return initialization;
};

/** Habits on Today as the bucket `habit_count` carries. */
export function habitCountBucket(count: number): HabitCountBucket {
  if (count <= 0) return '0';
  if (count <= 3) return '1-3';
  if (count <= 9) return '4-9';
  return '10+';
}

/** How long after an account's creation its first sign-in can land. Both are server times. */
const NEW_ACCOUNT_WINDOW_MS = 60_000;

/**
 * Whether a sign-in is the one that created the account — Sign Up rather than Sign In. Apple and
 * Google have no separate sign-up: the ID-token exchange creates the user on first use, and the only
 * trace of that is a last sign-in stamped at the moment of creation. Both timestamps come from the
 * server, so the device clock plays no part, and neither is ever sent. Missing or unreadable, it
 * counts as an existing account.
 */
export function isNewAccount(user: Pick<User, 'created_at' | 'last_sign_in_at'> | null | undefined): boolean {
  if (!user?.last_sign_in_at) return false;
  const gap = Math.abs(Date.parse(user.last_sign_in_at) - Date.parse(user.created_at));
  return Number.isFinite(gap) && gap < NEW_ACCOUNT_WINDOW_MS;
}

/**
 * A failure as an event can carry it: the SDK's or the server's own code, or `unknown`. Never the
 * message, which can quote what the user typed.
 */
export function errorCode(error: unknown): string {
  const { code, name } = (error ?? {}) as { code?: unknown; name?: unknown };
  if ((typeof code === 'string' || typeof code === 'number') && /^[\w.-]{1,64}$/.test(String(code))) return String(code);
  if (name === 'AuthRetryableFetchError') return 'network';
  return 'unknown';
}

/** Mixpanel cuts a string property at 255 bytes; the contract is 200 characters a part. */
const REFERRER_PART_LENGTH = 200;
/** The read goes to the Play Store, which can be slow to bind or never answer. */
const REFERRER_READ_TIMEOUT_MS = 10_000;
/** Launches that may try the referrer; after that it is settled unsent. */
const MAX_REFERRER_READS = 3;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('failed'));
      },
    );
  });

/** `referrer_0`, `referrer_1`, ... The raw string, neither decoded nor parsed. */
function splitReferrer(referrer: string): Record<string, string> {
  const parts: Record<string, string> = {};
  for (let start = 0; start < referrer.length; start += REFERRER_PART_LENGTH) {
    parts[`referrer_${start / REFERRER_PART_LENGTH}`] = referrer.slice(start, start + REFERRER_PART_LENGTH);
  }
  return parts;
}

/**
 * `Install Attribution`, if this install still owes it. One read per launch at most: a failed,
 * timed-out or empty read sends nothing and leaves it owed for a later launch, up to
 * {@link MAX_REFERRER_READS} launches. (expo-application stringifies a null referrer, so `'null'`
 * is empty too.)
 */
const sendInstallAttribution = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  const install = readInstall();
  if (!install || install.existing || install.installAttributionSent !== false) return;

  const reads = install.referrerReads ?? 0;
  if (reads >= MAX_REFERRER_READS) {
    writeStoredJSON(INSTALL_KEY, { ...install, installAttributionSent: true });
    return;
  }
  writeStoredJSON(INSTALL_KEY, { ...install, referrerReads: reads + 1 });

  let referrer: string;
  try {
    referrer = await withTimeout(Application.getInstallReferrerAsync(), REFERRER_READ_TIMEOUT_MS);
  } catch {
    return;
  }
  if (!referrer || referrer === 'null') return;

  const latest = readInstall();
  if (!latest || latest.installAttributionSent !== false) return;
  writeStoredJSON(INSTALL_KEY, { ...latest, installAttributionSent: true });
  await analytics.track(ANALYTICS_EVENTS.INSTALL_ATTRIBUTION, splitReferrer(referrer));
};

/** This launch's attribution attempt, so however often it is asked for it reads the referrer once. */
let attribution: Promise<void> | null = null;

/**
 * `Activated`, the one time a new install owes it. No properties of its own: the trigger's (a
 * count, a screen) stay on the trigger, and nothing about which habits ever rides this one.
 */
const sendActivated = (): void => {
  const install = readInstall();
  if (!install || install.existing || install.activatedSent !== false) return;
  writeStoredJSON(INSTALL_KEY, { ...install, activatedSent: true });
  void analytics.track(ANALYTICS_EVENTS.ACTIVATED);
};

export const analytics = {
  /**
   * Track a product event; the name must come from `ANALYTICS_EVENTS`. An event in
   * `FIRST_TIME_EVENTS` gets `first_time`, true only the first time this install sends it.
   */
  async track(event: AnalyticsEventName, properties?: AnalyticsProperties): Promise<void> {
    try {
      // Decided before the await, so two quick calls cannot both be the first.
      const sent = FIRST_TIME_EVENTS.includes(event) ? { ...properties, first_time: firstTime(event) } : properties;
      await initializeMixpanel();
      mixpanelInstance?.track(event, sent);
      if (event === ACTIVATION_TRIGGER) sendActivated();
    } catch {
      // Silent by design.
    }
  },

  /** Track an event once per install (`key` tells apart the onces of one event); later calls do nothing. */
  async trackOnce(event: AnalyticsEventName, properties: AnalyticsProperties, key: string): Promise<void> {
    if (!firstTime(`once:${key}`)) return;
    await analytics.track(event, properties);
  },

  /**
   * Add or change super properties. Kept here as well as in the SDK, so `reset` (which clears the
   * SDK's) and a later initialisation both start from them. Unchanged values send nothing.
   * `install_id` is this module's own, and not among them.
   */
  async register(properties: Omit<SuperProperties, 'install_id'>): Promise<void> {
    const changed = (Object.keys(properties) as (keyof typeof properties)[]).some(
      (key) => registered[key] !== properties[key],
    );
    if (!changed) return;
    registered = { ...registered, ...properties };
    try {
      await initializeMixpanel();
      mixpanelInstance?.registerSuperProperties({ ...properties });
    } catch {
      // Silent by design.
    }
  },

  /** Start a new anonymous id (sign-out, account deletion), keeping the super properties and `install_id`. */
  async reset(): Promise<void> {
    try {
      await initializeMixpanel();
      mixpanelInstance?.reset();
      mixpanelInstance?.registerSuperProperties(superProperties());
    } catch {
      // Silent by design.
    }
  },

  /**
   * The install's First Open, sent once and remembered on the device. `existingInstall`: a session
   * was already stored, so this is an update of an install from before analytics, not a new user.
   * Such an install has no `install_date`, its first actions are no longer first, and it owes no
   * Install Attribution or Activated. `install_kind` says the same as `existing_install`, which
   * stays for the boards built on it.
   */
  async firstOpen(existingInstall: boolean): Promise<void> {
    if (readStoredJSON<InstallRecord>(INSTALL_KEY)) return;
    const record: InstallRecord = {
      date: todayLocalISO(),
      existing: existingInstall,
      installAttributionSent: existingInstall,
      referrerReads: 0,
      activatedSent: existingInstall,
    };
    writeStoredJSON(INSTALL_KEY, record);
    if (existingInstall) writeStoredJSON(SEEN_KEY, [...new Set([...readSeen(), ...FIRST_TIME_EVENTS])]);
    else void analytics.register({ install_date: record.date });
    await analytics.track(ANALYTICS_EVENTS.FIRST_OPEN, {
      existing_install: existingInstall,
      install_kind: existingInstall ? 'existing' : 'new',
    });
  },

  /**
   * `Install Attribution`, on Android, the one time a new install owes it. Called on every launch
   * after `firstOpen`, so a failed read is tried again by a later one; reads at most once a launch.
   */
  attributeInstall(): Promise<void> {
    attribution ??= sendInstallAttribution().catch(() => {
      // Silent by design; owed still, for the next launch.
    });
    return attribution;
  },

  trackSignIn: (method: AuthMethod): Promise<void> => analytics.track(ANALYTICS_EVENTS.SIGN_IN, { method }),
  trackSignUp: (method: AuthMethod): Promise<void> => analytics.track(ANALYTICS_EVENTS.SIGN_UP, { method }),
  trackSignOut: (): Promise<void> => analytics.track(ANALYTICS_EVENTS.SIGN_OUT),
};
