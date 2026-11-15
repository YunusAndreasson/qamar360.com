// Expo's defaults, wrapped by Sentry so release builds emit the debug IDs that tie
// a minified stack trace back to its source map.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
