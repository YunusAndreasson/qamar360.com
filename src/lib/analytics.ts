/**
 * Mixpanel, lazily initialised and silent.
 *
 * Analytics is never allowed to break the app: a missing token (development, tests), a failed
 * init, a network error or an SDK throw all resolve as a no-op. Nothing here throws or logs.
 *
 * Anonymous by design: there is no `identify` and no people profile. `reset` on sign-out and
 * account deletion starts a fresh anonymous id, so two accounts on one device do not share one.
 * What describes the install rather than the account (the super properties, the First Open, which
 * events it has already sent once) outlives that reset: the super properties are kept here and
 * put back after it, and the rest is stored on the device.
 */
import {
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
import { readStoredJSON, writeStoredJSON } from '@/lib/web-storage';

import type { User } from '@supabase/supabase-js';
import type * as MixpanelModule from 'mixpanel-react-native';

// Narrower than the SDK's permissive property values.
type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

/** Every super property registered this run — what `reset` puts back. */
let registered: SuperProperties = {};

/** The install's First Open, stored once: its day, and whether the install already had a session. */
type InstallRecord = { date: string; existing: boolean };
const INSTALL_KEY = 'analytics.install.v1';
/** Keys this install has already sent: an event name for `first_time`, `once:<key>` for `trackOnce`. */
const SEEN_KEY = 'analytics.seen.v1';

/** `install_date` is only a cohort for an install that began with this build; an update has none. */
const installProperties = (): SuperProperties => {
  const install = readStoredJSON<Partial<InstallRecord>>(INSTALL_KEY);
  return install && install.existing === false && typeof install.date === 'string' ? { install_date: install.date } : {};
};

const superProperties = (): SuperProperties => ({ ...installProperties(), ...registered });

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
   */
  async register(properties: SuperProperties): Promise<void> {
    const changed = (Object.keys(properties) as (keyof SuperProperties)[]).some(
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

  /** Start a new anonymous id (sign-out, account deletion), keeping the super properties. */
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
   * Such an install has no `install_date`, and its first actions are no longer first.
   */
  async firstOpen(existingInstall: boolean): Promise<void> {
    if (readStoredJSON<InstallRecord>(INSTALL_KEY)) return;
    const record: InstallRecord = { date: todayLocalISO(), existing: existingInstall };
    writeStoredJSON(INSTALL_KEY, record);
    if (existingInstall) writeStoredJSON(SEEN_KEY, [...new Set([...readSeen(), ...FIRST_TIME_EVENTS])]);
    else void analytics.register({ install_date: record.date });
    await analytics.track(ANALYTICS_EVENTS.FIRST_OPEN, { existing_install: existingInstall });
  },

  trackSignIn: (method: AuthMethod): Promise<void> => analytics.track(ANALYTICS_EVENTS.SIGN_IN, { method }),
  trackSignUp: (method: AuthMethod): Promise<void> => analytics.track(ANALYTICS_EVENTS.SIGN_UP, { method }),
  trackSignOut: (): Promise<void> => analytics.track(ANALYTICS_EVENTS.SIGN_OUT),
};
