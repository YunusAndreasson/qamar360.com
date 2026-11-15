/**
 * Mixpanel configuration and the product events it may receive.
 *
 * No user identity is ever sent: events ride Mixpanel's anonymous device id, and no user id,
 * email, name, habit name or to-do title goes in as a property. Mixpanel's own server-side IP
 * geolocation (city, region, country) is left on.
 */

/** Unset in development and tests, where analytics is a silent no-op. */
export const MIXPANEL_TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;

/** The Mixpanel project uses EU data residency, so events go to the EU ingestion endpoint. */
export const MIXPANEL_SERVER_URL = 'https://api-eu.mixpanel.com';

export const ANALYTICS_EVENTS = {
  // Authentication — `method` is the only property.
  SIGN_IN: 'Sign In',
  SIGN_UP: 'Sign Up',
  SIGN_OUT: 'Sign Out',
  ACCOUNT_DELETED: 'Account Deleted',

  // Navigation — `screen` is the route path, which carries no user content.
  SCREEN_VIEWED: 'Screen Viewed',

  // The habit loop.
  HABITS_ADDED: 'Habits Added',
  HABIT_COMPLETED: 'Habit Completed',
  DAY_COMPLETED: 'Day Completed',
} as const;

/** `analytics.track` takes this rather than `string`, so an ad-hoc event name is a compile error. */
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
