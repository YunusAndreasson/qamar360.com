/**
 * Mixpanel configuration and the product events it may receive.
 *
 * No user identity is ever sent: events ride Mixpanel's anonymous device id and a random
 * `install_id` made on the device, and no user id, email, name, habit name or to-do title goes in
 * as a property. Nor does anything that says which practice someone keeps: no stack, template or
 * preset id, no prayer-time anchor. A property says how something was done (`source`, a count, a
 * yes/no), never what. Mixpanel's own server-side IP geolocation (city, region, country) is left on.
 */

/** Unset in development and tests, where analytics is a silent no-op. */
export const MIXPANEL_TOKEN = process.env.EXPO_PUBLIC_MIXPANEL_TOKEN;

/** The Mixpanel project uses EU data residency, so events go to the EU ingestion endpoint. */
export const MIXPANEL_SERVER_URL = 'https://api-eu.mixpanel.com';

export const ANALYTICS_EVENTS = {
  // The install and its opens. First Open is once per install; App Opened is the "active" event:
  // `launch` cold (once per JS start, in the foreground) or warm (back after 30 s or more away).
  FIRST_OPEN: 'First Open',
  APP_OPENED: 'App Opened',

  // Install attribution, read by marketer: the names (and `install_id`, `install_kind`,
  // `referrer_0`, `referrer_1`, ...) are a contract, and renaming one breaks it without an error on
  // either side. Each once per install, and only for an install that began with this code: Install
  // Attribution (Android) carries the raw Play install referrer, Activated nothing at all.
  INSTALL_ATTRIBUTION: 'Install Attribution',
  ACTIVATED: 'Activated',

  // Authentication — `method` is the only property, plus `mode` and a `code` (never the message)
  // on a failure.
  SIGN_IN: 'Sign In',
  SIGN_UP: 'Sign Up',
  AUTH_FAILED: 'Auth Failed',
  SIGN_OUT: 'Sign Out',
  ACCOUNT_DELETED: 'Account Deleted',

  // Navigation — `screen` is the route path, which carries no user content.
  SCREEN_VIEWED: 'Screen Viewed',
  ONBOARDING_STEP_VIEWED: 'Onboarding Step Viewed',

  // The habit loop.
  HABITS_ADDED: 'Habits Added',
  HABITS_ADDED_UNDONE: 'Habits Added Undone',
  HABIT_COMPLETED: 'Habit Completed',
  HABIT_SKIPPED: 'Habit Skipped',
  HABIT_DELETED: 'Habit Deleted',
  DAY_COMPLETED: 'Day Completed',
  STACK_CREATED: 'Stack Created',
  STACK_DELETED: 'Stack Deleted',
  PROGRESS_RESET: 'Progress Reset',

  // Notifications. A Prompt Shown says which `dialog` the user saw: the app's own `primer` sheet,
  // or the `system` one. A Result follows every ask, `prompted` saying whether the OS asked.
  PERMISSION_PROMPT_SHOWN: 'Permission Prompt Shown',
  PERMISSION_RESULT: 'Permission Result',
  NOTIFICATION_OPENED: 'Notification Opened',
  LUNAR_UPDATES_TOGGLED: 'Lunar Updates Toggled',
} as const;

/** `analytics.track` takes this rather than `string`, so an ad-hoc event name is a compile error. */
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * The core actions whose first occurrence on an install is the funnel step. `analytics.track`
 * stamps each with `first_time` itself (Mixpanel's Free plan refuses the "first time" filter), from
 * a list kept on the device that sign-out does not clear.
 */
export const FIRST_TIME_EVENTS: readonly AnalyticsEventName[] = [
  ANALYTICS_EVENTS.HABITS_ADDED,
  ANALYTICS_EVENTS.HABIT_COMPLETED,
  ANALYTICS_EVENTS.DAY_COMPLETED,
  ANALYTICS_EVENTS.STACK_CREATED,
];

/**
 * The event whose first occurrence on a new install is its activation, sent as `Activated` right
 * after it. A proposal awaiting the owner's yes (plans/install-attribution-2026-11.md): the first
 * habits added, i.e. setup done. Changing the activation moment is changing this line. `Activated`
 * copies none of the trigger's properties, so whatever the trigger says stays on that event.
 */
export const ACTIVATION_TRIGGER: AnalyticsEventName = ANALYTICS_EVENTS.HABITS_ADDED;

/** Habits on Today, in the buckets the boards segment by. '0' on Today is the empty state. */
export type HabitCountBucket = '0' | '1-3' | '4-9' | '10+';

/** Properties sent with every event, kept by `analytics.register` across `reset`. */
export type SuperProperties = {
  /**
   * A random UUID made once per install and kept on the device: the one join between an install's
   * events (and its Play referrer) for marketer. Mixpanel only; never Sentry, Supabase or anyone
   * else. Set by `analytics` itself, never through `register`.
   */
  install_id?: string;
  /** The local day of the install's First Open, YYYY-MM-DD. Unset on an install that predates it. */
  install_date?: string;
  /** Lunar updates switched on AND allowed by the OS: whether the app can reach this person. */
  notifications_enabled?: boolean;
  signed_in?: boolean;
  habit_count?: HabitCountBucket;
};

export type AuthMethod = 'email' | 'apple' | 'google';

/** Where Habits Added came from: the screen, never what was added. */
export type HabitsAddedSource = 'stack_library' | 'discover' | 'editor' | 'exchange_library' | 'exchange';

/** A stack of the user's own, or one of the ready-made ones. */
export type StackCreatedSource = 'own' | 'curated';

/** Where a notification permission ask started. */
export type PermissionSource = 'settings' | 'first_day_completed';
