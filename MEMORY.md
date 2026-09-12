# Project Environment

2026-09-09 inspector result and session corrections:

```json
{"project_type":"expo","is_react_native":true,"is_expo":true,"is_web":true,"is_ios":true,"is_android":true,"is_native_ios":false,"is_native_android":false,"expo":"57.0.21","react_native":"0.86.3","react":"19.2.3","package_manager":"npm","bundler":"metro","metro_port":8081,"android_device":"emulator-5554","android_avd":"pixel","android_arch":"x86_64","android_sdk":35,"ios_has_podfile":true,"android_has_gradle":true,"ios_build_available":false,"verify":"npm run verify","web_verify":"cd web && pnpm verify"}
```

Android target command: `npm run android -- --device pixel --no-bundler` (Expo
expects the AVD name). Local inference adds native dependencies; runtime policy
is now fingerprint. See `docs/local-insights.md`. This session used a fresh Metro
on port 8082 because the pre-existing 8081 module graph predated dependency changes.

- React Native app using Expo SDK 57.0.20, React Native 0.86.3, and Expo Router 57.0.19.
- Package manager: npm (`package-lock.json`).
- Metro: `npm start`, default port 8081.
- Run targets: `npm run android` and `npm run ios`.
- Android application ID and iOS bundle ID: `com.qamar360.app`; URL scheme: `qamar360`.
- Both generated native projects (`android/`, `ios/`) are present.
- Verification: `npm run verify` (TypeScript, ESLint, Knip, Jest).
- No repository E2E framework is configured; interactive QA uses Argent.

- 2026-09-05 QA: Android `emulator-5554`, Qamar Metro 8082; port 8081 belongs to another project.
- Dedicated QA account credentials are stored in ignored `.argent/secrets.env`; account has one completed Waking up stack and one completed QA to-do.
- Review evidence and remaining coverage: `docs/main-flows-review.md`.
