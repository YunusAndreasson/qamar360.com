# On-device insight generation

Closed lunar quarters support multiple local reflection versions. A generation uses
the latest version from each of the four preceding lunar quarters and the previous
version of the current quarter, when available. Earlier suggestions are explicitly
not treated as evidence that an action happened. Recorded habit metrics take
precedence over earlier model text.

## Runtime and storage

- React Native ExecuTorch 0.10.1; Gemma 4 E2B XNNPACK 8da4w export pinned to
  `e20831dd07f0f0d2bb6ee85e204e974a8a69b903`. Downloaded files are checked by size
  and SHA-256 before installation. About 2.67 GB is downloaded explicitly in Settings.
- The download guard requires 6 GiB reported RAM and about 3.2 GB free storage.
  This is an initial conservative guard, not a measured guarantee against memory pressure.
- The export's 4,048-token context is budgeted with a 2,800-token input limit,
  a compact fallback and at most 900 output tokens. Invalid JSON is retried once
  in a fresh session; an invalid or cancelled result is never saved.
- Model files use the OS cache directory. They may be evicted and need downloading
  again. Generation never downloads implicitly or falls back to cloud inference.
- Account-scoped SQLite stores quarter snapshots and append-only insight versions
  in `Documents/local-insights` (Android's document directory is app files).
  The Expo plugin excludes this directory from iOS backup and Android backup/transfer.
  SQLite secure deletion is enabled. This is app-private storage, not an independently
  encrypted database.
- Opening a closed quarter with fresh records saves its inputs for offline reuse.
  Existing cloud reflections are imported read-only. New versions are never uploaded.
  Cloud endpoints and the old cloud consent setting remain for older app builds.
- Local journal permission defaults off and is independent of cloud permission.
  Revocation clears cached note bodies and all directly or transitively note-derived
  local versions, and invalidates in-flight work. Account deletion clears this account's
  archive. Signing out keeps the account-scoped archive for the next sign-in.
- Model inference telemetry is disabled. Normal app synchronization remains unchanged.

## Generation in the background

- A reflection runs in `src/lib/local-insight-job.ts`, outside any screen, so leaving the reading
  keeps it going and coming back shows its progress. One runs at a time.
- `modules/continued-work` is a local Expo module that asks the system to keep the work running
  when the app is backgrounded. On iOS 26 and newer it submits a `BGContinuedProcessingTask`,
  which the system shows as a Live Activity with progress and a cancel control. On Android it
  starts a `dataSync` foreground service with a progress notification and a Cancel action.
- The iOS request uses the `fail` strategy, so it starts immediately or not at all. Identifiers
  live under `com.qamar360.app.reflection.*` in `BGTaskSchedulerPermittedIdentifiers`, and every
  task registers its own identifier because registering one twice kills the app.
- Where continued work is unavailable (iOS 17 to 25, the Simulator, a refused request, or a binary
  built before the module), backgrounding the app cancels the generation.
- Progress: loading and reading the prompt are fixed steps, and writing scales the token count
  against about 320 tokens. The progress shown by the system never moves backwards across the
  retry. iOS expires tasks that report no progress. Model loading reports none while it runs, and
  its duration has not been measured on a phone.
- The draft paragraphs are read out of the partial JSON and shown unvalidated. Only
  `parseLocalInsight` decides what is saved.
- ExecuTorch echoes the prompt into the reply unless the generation config sets `echo: false`.
  In a chat session that prompt is the `<|turn>model` header, and it made every reply fail to
  parse until it was turned off.
- Before an Android release, Google Play needs the `dataSync` foreground service type declared
  in Play Console, with a description and a video of the feature.

Not yet verified on a device: whether iOS keeps the 2.6 GB model alive in the background, whether
the silent model load trips iOS stall expiry, and any Android hardware.

## Native release

A new native build is required; this cannot be delivered to the previous binary as
a JavaScript-only update. Runtime version policy is `fingerprint` so incompatible
native runtimes do not receive this update. Prebuild generates the backup rules.

When initiating an iOS EAS build from Linux, use an independent `npm ci` install
in the release checkout, not a symlink to another checkout's `node_modules`.
ExecuTorch's installer normally skips iOS artifacts on Linux: provision them with
`RNET_TARGET=ios node node_modules/react-native-executorch/scripts/download-libs.js`.
Remove only the extracted AppleDouble `._*` metadata files from this package before
resolving the fingerprint; macOS tar consumes them as metadata instead of files.
Both steps are required. Either one alone still resolves a different fingerprint.

Verify the fingerprint locally before starting a build. EAS rejects a mismatch
only after installing pods, so a mismatched build is discovered late and costs a
near-complete build:

```
eas fingerprint:generate --platform ios --build-profile production --json --non-interactive
```

This reproduces the value the CLI sends. A rejected build's log prints the value
EAS resolved alongside a per-source diff naming the `node_modules` directories
that differ, so the two can be reconciled locally and compared before retrying.
Read that log through the GraphQL `logFiles` query rather than the CLI, which
reports only `Unknown error`; the file is brotli-compressed JSONL.

A local Android build can break the iOS fingerprint. The Android Gradle Plugin
rewrites `AndroidManifest.xml` files inside `node_modules` in place, removing the
deprecated `package` attribute, and the edited file no longer matches the copy a
clean install produces on EAS. This was observed in
`@react-native-masked-view/masked-view` after an `expo run:android`. To identify
an affected package, extract its exact version with `npm pack` into an empty
directory and compare it against the installed copy with `diff -rq`, then restore
the original file. Gradle output directories (`android/build`, `android/.cxx`)
are already excluded from fingerprinting and can be left alone.

Verified iOS fingerprints: release commit `abf7220` is
`71f3c475b22598ed42927601e71f23e81cd7077c`; release commit `4b6c945` is
`288dcd512f9605be62fb1a76d9c96c0deb1ee121`.

Validation completed during implementation: root verification (1,042 tests plus
typecheck, lint and Knip), web verification (134 tests, typecheck and build), Android
development build/install, Android settings and closed-quarter rendering, snapshot
creation, missing-model handling, settings navigation, and the low-memory download
guard after a cold app start. Unit tests exercise
history selection, strict output parsing, account isolation, note revocation,
failed writes, offline Map serialization, cancellation and malformed-output retries.
Runtime calls are mocked in unit tests.

Emulator QA found and fixed missing `AbortSignal.throwIfAborted` support and Metro
async loading of the native helper modules. Reanimated crashed during development
client reloads (native stack in `libreanimated.so`); cold starts allowed the checks
above to complete. Reload stability remains a separate QA concern.

Before release, run actual download and inference on supported physical Android
and iOS devices. Measure cold load, first-token and total latency, peak memory,
thermal behavior and cancellation/background cleanup. Exercise offline cold start,
account switching during generation, consent revocation, interrupted downloads and
storage exhaustion. Review generated output against sparse, contradictory and
adversarial journal/history fixtures. These hardware and model-quality checks have
not been completed in the emulator environment. The iOS production archive passed
on EAS for version `1448.3.24 (29)`, build
`c5682b4f-5463-4c8c-8f19-f7f5944e8cfe`, from isolated release commit `abf7220`.
