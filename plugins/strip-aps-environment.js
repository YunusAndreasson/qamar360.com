// Config plugin: remove the `aps-environment` entitlement that expo-notifications
// adds for *remote* push. qamar360 only uses *local* notifications (the lunar
// moon-quarter updates, scheduled through UNUserNotificationCenter), which don't
// need it — and keeping it would force the iOS provisioning profile to carry the
// Push Notifications capability (which it doesn't), breaking `eas build`.
//
// MUST BE FIRST in app.json's `plugins`. Mods run in *reverse* registration order —
// the last plugin registered is the first to run — so listing this one last (the
// intuitive reading, and how it originally shipped) made it strip an empty
// entitlements dict before expo-notifications ever filled it, and the key sailed
// through to the build. Registered first, it runs last, and actually strips.
//
// To verify after any plugin/SDK change: `npx expo prebuild --platform ios --clean`,
// then ios/qamar360/qamar360.entitlements must hold applesignin and NOT aps-environment.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function stripApsEnvironment(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
