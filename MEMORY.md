# Project Environment

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
