/**
 * Mixpanel, lazily initialised and silent.
 *
 * Analytics is never allowed to break the app: a missing token (development, tests), a failed
 * init, a network error or an SDK throw all resolve as a no-op. Nothing here throws or logs.
 *
 * Anonymous by design: there is no `identify` and no people profile. `reset` on sign-out and
 * account deletion starts a fresh anonymous id, so two accounts on one device do not share one.
 */
import { ANALYTICS_EVENTS, MIXPANEL_SERVER_URL, MIXPANEL_TOKEN, type AnalyticsEventName } from '@/constants/analytics';

import type * as MixpanelModule from 'mixpanel-react-native';

// Narrower than the SDK's permissive property values.
type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

let mixpanelInstance: MixpanelModule.Mixpanel | null = null;

const startMixpanel = async (token: string): Promise<void> => {
  // Required lazily so tests and a token-less build never load the native module.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Mixpanel } = require('mixpanel-react-native') as typeof MixpanelModule;
  const trackAutomaticEvents = false;
  const instance = new Mixpanel(token.trim(), trackAutomaticEvents);
  const optOutTrackingDefault = false;
  await instance.init(optOutTrackingDefault, {}, MIXPANEL_SERVER_URL);
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

export const analytics = {
  /** Track a product event; the name must come from `ANALYTICS_EVENTS`. */
  async track(event: AnalyticsEventName, properties?: AnalyticsProperties): Promise<void> {
    try {
      await initializeMixpanel();
      mixpanelInstance?.track(event, properties);
    } catch {
      // Silent by design.
    }
  },

  /** Start a new anonymous id (sign-out, account deletion). */
  async reset(): Promise<void> {
    try {
      await initializeMixpanel();
      mixpanelInstance?.reset();
    } catch {
      // Silent by design.
    }
  },

  trackSignIn: (method: string): Promise<void> => analytics.track(ANALYTICS_EVENTS.SIGN_IN, { method }),
  trackSignUp: (method: string): Promise<void> => analytics.track(ANALYTICS_EVENTS.SIGN_UP, { method }),
  trackSignOut: (): Promise<void> => analytics.track(ANALYTICS_EVENTS.SIGN_OUT),
};
