# Expo 57 UI review

Reviewed September 2026 against the [versioned Expo 57 docs](https://docs.expo.dev/versions/v57.0.0/).

## Changes

- Android native tabs keep every label visible.
- Today has separate date navigation, a native calendar, and a return-to-today action.
- To-dos start collapsed with remaining/completed counts. Adding or editing opens the list.
- Routine headers show completed/total counts independently of their expand button.
- Add uses grouped rows. Shared sheets scroll and have a close button.
- Progress and habit charts show percentages. Monthly progress still divides daily completion by all days in the lunar month; chart buckets retain their own denominators. Missing data is not displayed as zero.
- Forms retain labels, show focus and errors, expose password visibility, and use Keyboard Controller to keep focused fields visible.
- To-do actions use Expo UI native menus. Date/time selection uses Expo UI (SwiftUI on iOS, Compose dialogs on Android).
- Goal labels state remaining work and target dates directly. Notification settings distinguish permission from the app's update preference.
- Generated insight prompt version 2 requires evidence-based observations and plain copy. Existing saved insights are not regenerated. The server change requires a separate deployment.

## API and dependency decisions

Expo 57 targets React Native 0.86 and React 19.2.3. The project uses those versions. New dependencies were installed through `expo install`: `@expo/ui` 57.0.16 and `react-native-keyboard-controller` 1.21.9. They require a new native build; an OTA update alone is insufficient.

Existing current APIs retained: Router NativeTabs and native search bars, native-stack form sheets, Expo Image, File/Directory/Paths, Gesture Handler 3 hooks, Reanimated shared-value get/set, Worklets scheduleOnRN, React useEffectEvent, and React Compiler. Experimental router APIs were not introduced without a concrete need.

The existing Expo validation exclusions need separate review:

| Package | Installed | Decision |
| --- | --- | --- |
| Gesture Handler | 3.1.0 | Retain the existing v3 hook API; downgrading to Expo's v2 recommendation would remove APIs the app uses. Installed README requires RN 0.82 or newer. |
| Reanimated | 4.5.3 | Retain with Worklets 0.10.1. Both the installed compatibility file and upstream matrix support RN 0.86 and this Worklets line. |
| Safe Area Context | 5.8.1 | Retain the existing override; included in native build verification. No new feature requires a different version. |

A newer npm version is not proof of compatibility. In particular, Reanimated 4.6 requires Worklets 0.12; upgrading only one breaks the supported pair. The exclusions mean an Expo dependency check alone cannot certify the entire native stack.

References:

- [Expo UI](https://docs.expo.dev/versions/v57.0.0/sdk/ui/)
- [Keyboard Controller](https://docs.expo.dev/versions/v57.0.0/sdk/keyboard-controller/)
- [Native tabs](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/)
- [Reanimated compatibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/compatibility/)

## Verification

- Android debug build passed, including the final build after removing the community date picker.
- Web `pnpm verify` passed: 131 tests, TypeScript, and production build.
- Mobile `npm run verify` passed: 40 suites, 974 tests, TypeScript, lint, and dead-code checks.
- Calendar conversion tests passed under `America/Los_Angeles` and `Pacific/Kiritimati` (UTC+14).
- Live Argent review confirmed the signed-in Today screen, all four tab labels, collapsed to-do counts, routine completion counts, a dark native calendar with future dates disabled, and selection of September 4 as Yesterday with a return-to-today action.
- Before screenshot: `/tmp/simserver-ePVGa9/media/817991923-1788557995838.png`.
- Updated Today: `/tmp/simserver-JtJU22/media/805695217-1788560876956.png`.
- Calendar: `/tmp/simserver-JtJU22/media/657291448-1788560996704.png`.
- Selected past date: `/tmp/simserver-JtJU22/media/506913113-1788561010558.png`.

Device QA is incomplete: another session repeatedly switched the shared Pixel emulator to another app, including during a describe call. No user records were intentionally changed. Add/sheet scrolling, native menu actions, keyboard flows, light appearance, large text, reduced motion, and back-navigation regression checks still need an uninterrupted device session. No accessibility settings were changed. iOS cannot be run in this Linux environment.

The Android emulator also experienced launcher and System UI ANRs under build load. Argent's reboot failed; a headless cold start with 3 GB memory recovered it without wiping data. The emulator remains running, with Qamar360 installed and its sign-in preserved.
