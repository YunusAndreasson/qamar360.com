/**
 * Error reporting. Imported first by the root layout, so it is set up before anything else runs.
 *
 * Off without a DSN and in development. No screenshots, view hierarchy (it holds habit names and
 * to-do titles), network or console breadcrumbs, request data or user identity are attached; only
 * navigation breadcrumbs (route names) are kept. Native crashes are sent on the next launch.
 */
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';

/** Registered with the Expo Router navigation container in the root layout. */
export const navigationIntegration = Sentry.reactNavigationIntegration();

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
export const sentryEnabled = Boolean(dsn && !__DEV__);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    environment: Updates.channel || 'production',
    // `sendDefaultPii` and `dataCollection` both unset keep the SDK on its no-PII mapping; setting
    // `dataCollection` at all starts from collect-everything defaults.
    tracesSampleRate: 0.1,
    enableNative: true,
    enableNativeCrashHandling: true,
    enableWatchdogTerminationTracking: true,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableLogs: false,
    enableUserInteractionTracing: false,
    enableNetworkBreadcrumbs: false,
    enableCaptureFailedRequests: false,
    integrations: [
      navigationIntegration,
      Sentry.breadcrumbsIntegration({
        console: false,
        fetch: false,
        xhr: false,
        dom: false,
        history: false,
        sentry: false,
      }),
    ],
    beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === 'navigation' ? breadcrumb : null),
    beforeSend: (event) => {
      delete event.user;
      delete event.request;
      delete event.extra;
      return event;
    },
  });
  Sentry.setTags({
    app: 'qamar360',
    expo_update_id: Updates.updateId ?? 'embedded',
    expo_runtime_version: Updates.runtimeVersion ?? 'unknown',
    expo_is_embedded: String(Updates.isEmbeddedLaunch),
  });
}
