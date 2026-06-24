// Config plugin: remove the `aps-environment` entitlement that expo-notifications
// adds for *remote* push. qamar360 only uses *local* notifications (weekly habit
// reminders via UNUserNotificationCenter), which don't need it — and keeping it
// would force the iOS provisioning profile to carry the Push Notifications
// capability (which it doesn't), breaking `eas build`. Runs last so it strips the
// key after expo-notifications has added it.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function stripApsEnvironment(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
