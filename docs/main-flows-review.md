# Main flow review — 2026-09-05

## Scope and current status

Reviewed the mobile app's auth, Today/habits/tasks, Discover, Progress, Insights/goals,
and settings/notification code. Created a dedicated QA account and exercised signed-in stack creation/completion,
task creation/completion, Discover opening and scrolling, Insights, Progress, and Settings appearance.
This is not an app-wide performance sign-off.

The implementation follows the project's [Expo 57 reference](https://docs.expo.dev/versions/v57.0.0/)
and React's [Effect Event guidance](https://react.dev/reference/react/useEffectEvent).
React Compiler is enabled; the profiler identifies compiled app components. No
blanket manual memoization or dependency upgrade was applied.

## Changes

- Today and Insights pull-to-refresh include goals/check-ins and surface goal-load errors.
- Discover search and category cards reuse one preset-row renderer. Accessibility hints
  distinguish adding to a stack, removing membership, locating an existing stacked habit,
  and deleting a habit.
- Habit completion and task refreshes share a mutation guard. Reads wait for pending
  writes, retry overlapping responses (at most three reads), and discard previous-day
  or previous-account results. Optimistic ticks are not overwritten by stale reads.
- The mutation wrapper is shared by habit and task providers. Temporary-task cleanup
  now awaits its Supabase DELETE rather than leaving its lazy query unexecuted.
- Lunar scheduling invalidates superseded work on disable, account/day/calendar changes,
  loading, and unmount. Progress and goal reads run concurrently with independent fallbacks.
  Cancellation suppresses stale scheduling; it does not abort the loader's network requests.
- Completed initial loads clear their unused timeout.

## Argent evidence

Device: `emulator-5554`, Android API 35, `zuhd-qa`; app: `com.qamar360.app`.
Metro: port 8082 (8081 belongs to another project). Native APK already present in the
workspace was installed; current JavaScript was served by Metro.

Replay: `.argent/flows/email-sign-in-review.yaml`.
Welcome → email sign-in → password-reset form → sign-in → sign-up form → sign-in.
Five navigation steps passed. A separate confirmed QA account was then created without
sending email; credentials are in ignored `.argent/secrets.env`. Runtime log registry
contained zero entries after the clean replay.

Clean dual profile, 15:29:29 UTC:

- 8.4 seconds; 11 React commits, 324 captured fiber renders.
- Six commits above the profiler's 16 ms floor; first form mount was 182.73 ms.
- CPU investigation of sign-in commits primarily surfaced native tree commits and
  development/instrumentation work, not an isolated application computation to optimize.
- Perfetto reported 19 jank frames. Its four listed CPU hotspots were emulator/kernel
  functions, including the QEMU graphics pipe. These are development-emulator measurements,
  not production-device timings or evidence of an improvement from this patch.
- The summary compiler flag was inconsistent with its per-component compiler labels;
  Metro and component-level evidence confirm compilation.

Native report: `/tmp/argent-profiler-cwd/native-profiler-20260905-152930-report.md`.
An earlier trace lost its React session when Metro stopped; it is not used as a comparison.

## Discover before/after

Same three-step `.argent/flows/discover-performance-review.yaml` replay on the same
signed-in account: Add sheet → Habit → wait for Fajr → two-second settle. Both passed.
The category FlatList now starts with one category, batches one category at a time,
and retains a three-viewport window. Search/category rendering shares the same helper.

| Measurement | Before | After |
| --- | ---: | ---: |
| Largest React commit | 5896.91 ms | 1252.63 ms |
| Preset rows in opening commit | 96 | 6 |
| Captured fiber renders | 3929 | 1769 |
| Trace duration | 15.01 s | 12.72 s |
| Native jank events | 68 | 34 |
| Worst native jank event | 426 ms | 783 ms |

The largest React commit fell about 79%. Native results are mixed: fewer events,
but a worse longest frame. Counts cover different trace durations and are not a
normalized frame-rate comparison. These are instrumented development-emulator
results, not release-device timings. Remaining category batch mounts still cost
hundreds of milliseconds. Two forward scroll gestures reached Qurʾān and dhikr rows
with populated accessible content.

Native reports: `/tmp/argent-profiler-cwd/native-profiler-20260905-155518-report.md`
and `/tmp/argent-profiler-cwd/native-profiler-20260905-155804-report.md`.

## Validation and remaining coverage

`npm run verify` passed after the changes: typecheck, ESLint, knip, 43 Jest suites,
989 tests. New deferred-promise tests exercise refresh/write races and scheduling
invalidation. Knip emits two existing configuration hints.

Signed-in UI checks confirmed the Waking up stack can be added and sealed (4/4),
Progress shows Today at 100%, Insights shows the expected new-account empty state,
and Settings renders in light and dark appearance. A to-do was created, completed,
and remained complete after switching tabs and returning. Android accessibility discovery
became unreliable after switching to dark appearance; the React debugger remained
connected and screenshots confirmed the theme change. Discovery subsequently recovered.
Additional task editing/deletion and goal CRUD,
search, offline recovery, day switching, and OS notification delivery need further
emulator coverage. Broad search still renders its matching rows in one category cell.
Release-device profiling remains necessary, especially for the long native frame.
