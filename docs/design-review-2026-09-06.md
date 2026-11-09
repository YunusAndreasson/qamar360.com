# Design review — Jakob's Law, Norman, and 2026 native
**2026-09-06 · qamar360 mobile at `06ba7b6` · Expo SDK 57 / RN 0.86**

## Method and scope

A read of all 44 routes, the 83 components, the design tokens (`constants/theme.ts`,
`constants/motion.ts`), navigation options, and `app.json`, against three lenses:
Jakob's Law (users spend their time in *other* apps, so ours should behave the way
those do), Norman's principles from *The Design of Everyday Things* (discoverability,
affordance/signifier, feedback, mapping, constraints, conceptual model, error
tolerance), and the 2026 platform baseline — iOS 26 and Android 16 conventions, plus
what Expo SDK 57 actually ships.

**Not verified on a device.** No iOS target exists on this host, and the two running
Android emulators belong to another workspace. Every finding below is grounded in code
or config, not in a screenshot. The visual claims that need eyes are marked as such.

## What is already right (so it does not get re-proposed)

Several things I went looking for as gaps turned out to be handled, and handled better
than most apps:

- **Reduce Motion is honoured properly.** Ten components read Reanimated's
  `useReducedMotion`, and `SkyProvider` *unmounts* the gravity sensor rather than
  zeroing it, so the setting stops the cost and not just the movement. The one infinite
  loop I expected to find ungated (the starfield twinkle) is gated through
  `running = skyMotion && foreground`.
- **Dynamic Type has a stated policy.** `ThemedText` scales freely by default and caps
  only the two display tiers, with `DenseLabelScale` for grid labels. That is a real
  policy, not an `allowFontScaling={false}` blanket.
- **Touch targets** are held at 44/48pt in ~25 components, with the hit-slop trade-off
  reasoned where two full-height targets sit adjacent (`stack-card.tsx:330`).
- **Error recovery** is thorough: every load failure gets a titled `EmptyState` with an
  explicit retry, errors are dismissible banners rather than modals, and destructive
  actions route through `confirmDestructive`. The `goalsError` surfacing that project
  memory records as missing on Today is now wired (`habits/index.tsx:755`).
- **Every drag capability has a screen-reader twin.** No function in the app is
  gesture-only.
- **Native navigation is used natively:** `NativeTabs` with `minimizeBehavior`, native
  `formSheet` with `fitToContents` detents and a grabber, `headerLargeTitle` on all four
  tab roots, SF Symbols through `expo-symbols`, and Material's own inline date picker.

The findings below are what is left.

---

## Findings

### 1. The first-run funnel disappears after one to-do — HIGH

`habits/index.tsx:448`:

```ts
const showEmptyState =
  entries.length === 0 && !taskCardShowing && checkInEntries.length === 0 &&
  looseHabits.length === 0 && exchanges.length === 0;
```

"Anchor your first stack" — with its **Choose an anchor** primary that routes into
`stack-library`, where `GuideIntro` teaches stacking including *"One tap seals the whole
stack"* — is the app's entire onboarding. It is a good one. But it only renders when the
day is **completely** empty.

The Add sheet's most familiar noun to anyone arriving from Reminders or Things is
**To-do**. A user whose first action is that one has permanently dismissed the
invitation to the app's actual thesis, and will never pass the stacking guide.
Their Today is one to-do, forever, with no route toward a stack.

The code comment defends the rule — "a user who tracks only those has a day" — and that
reasoning is sound for a user with three exchanges. It is not sound for a user with one
to-do on day one.

**Norman:** discoverability. **Jakob:** every habit app ends onboarding with the user's
first *habit* created, not their first anything.

**Fix:** keep the guard, but not for the account's first days. Gate the invitation on
"has never created a stack or habit" rather than "the day is visually empty", and render
it as a footer row below whatever is there rather than as a full-screen state.

### 2. Nothing on the home screen or Lock Screen — HIGH

The app's thesis is that an act survives when it is anchored to a cue that already
fires. The most-fired cue on the device is the Lock Screen, and the app puts nothing
there but a badge count (`TodayBadge`, `(tabs)/_layout.tsx`).

**`expo-widgets` ships in SDK 57** and covers home-screen widgets, Lock Screen
accessory widgets (`accessoryCircular` / `accessoryRectangular` / `accessoryInline`),
and Live Activities — authored in Expo UI components, no Swift. `createWidget()`,
`updateTimeline()`, `createLiveActivity()`.

This app has unusually good widget material already computed: the viewed day's moon
phase (`phaseOf`), the remaining-units count, the current chapter's stack, and the month
orbit. An `accessoryCircular` moon that fills as the day closes is close to a native fit.

**Norman:** visibility of system status, and the cue principle the app itself argues for
in `constants/guides.ts`. **Biggest single 2026-native gap.**

### 3. iOS app icon has no dark or tinted variant — MEDIUM

`app.json` has `"icon": "./assets/images/icon.png"` — one flat PNG. Android gets the
full treatment: adaptive foreground, background, **and** a monochrome layer for themed
icons.

So on Android the icon adapts to the user's wallpaper theme, and on iOS 26 it does not
adapt at all. For an app whose whole identity is a night sky, that is backwards. Expo
supports `ios.icon` as `{ light, dark, tinted }`.

**Jakob:** since iOS 18, users expect their home screen to be tintable end to end; one
opaque square in a tinted grid reads as an app that has not been updated.

### 4. Selective Liquid Glass, not a reskin — MEDIUM

`expo-glass-effect` is in SDK 57 (`GlassView`, `GlassContainer`,
`isLiquidGlassAvailable()`, falls back to a plain `View` below iOS 26).

The app already gets the system material free where it matters most — the tab bar sets
`blurEffect: 'systemChromeMaterial*'`, and `header-options.ts` deliberately leaves iOS
large-title bars unstyled so they keep the native glass. What is still solid fill is the
app's own floating chrome: the toast, the day-complete overlay, and `FormSheet`.

I would **not** reskin broadly. The night-sky palette is a deliberate, tuned, contrast-
contracted system, and glass over a starfield can turn a legible panel into mud. The
narrow case that is clearly right is the **toast** — it floats over content, it is
transient, and every system-level transient surface on iOS 26 is glass.

Needs eyes on an iOS 26 device before committing.

### 5. `predictiveBackGestureEnabled: false` — MEDIUM

`app.json:33`. It is the only line in that file with no reasoning attached, in a
codebase where every decision carries a paragraph — which suggests an inherited default
rather than a call. Android 16 makes predictive back the platform behaviour; with it
off, a back swipe in qamar360 is the one back swipe on the user's phone that does not
show them where they are going.

**Jakob's Law, in its purest form.** Worth at least a deliberate re-test: the risk is the
drag layer and the native `formSheet` routes, so it is a device check, not a config
flip.

### 6. No search over the user's own content — MEDIUM

`Stack.SearchBar` appears exactly once, in `discover.tsx:412` — the *catalog*. There is
no way to find one of your own habits, stacks, plans or goals.

That is fine at five habits and a real problem at forty, which is the trajectory the app
is built for (44 routes, six object types, an archive of readings by Hijri month).
Reminders, Things and Todoist all search your own items first and templates second.

### 7. Six first-class nouns and one shared teaching surface — MEDIUM

The Add sheet offers **Stack, Habit, Exchange, Check-in, To-do, Plan**. Elsewhere the app
also has *acts* (a habit inside a stack), *goals*, *readings*, and the daily
*reflection*. Ten nouns.

Each one is individually well-named and well-explained. But `GuideIntro` only exists in
the stack and exchange libraries, so the conceptual model is taught along two paths out
of six, and only to the user who has already chosen that path.

**Norman:** conceptual model. The Add sheet's sublabels ("A routine with several
habits", "Replace an unwanted habit") are doing more teaching than anything else in the
app, and they are one line each.

**Fix:** the cheapest real improvement is a single "How this app thinks" entry in
Settings that lays out the six nouns and how they relate — one screen, reachable, not in
the way.

### 8. Discover still renders through `FlatList` — MEDIUM

`discover.tsx:437`. The main-flow review of 2026-09-05 (since removed) measured this screen's
opening commit at 5896ms before batching work and 1252ms after. 1.25 seconds is still a
second and a quarter of nothing happening on the screen a new user is sent to by
*every* empty state in the app (`BrowseHabitsButton` appears on Progress, Insights, and
Today).

`@shopify/flash-list` v2 is in the SDK 57 matrix and is the direct answer to exactly
this. It is also the screen where the cost is most visible, because it is on the
critical path of first use.

### 9. Two date locales in one app — LOW

`lib/dates.ts:77,79` hardcodes `'en-US'`. `habits/day-picker.tsx:35` uses
`toLocaleDateString(undefined, …)`, i.e. the device locale. On a phone set to en-GB or
de-DE those two disagree, and the day picker's own fallback subtitle is the one place
the disagreement is visible side by side with the rest of the app.

`expo-localization` is not installed; `lib/geo.ts` reads the timezone straight off
`Intl`. Pick one convention and state it — most likely device locale throughout, since
the app already trusts `Intl` for Umm al-Qura.

### 10. Portrait-locked on iPad — LOW

`orientation: "portrait"` with `ios.supportsTablet: true`. iPadOS 26's windowing makes a
portrait-locked app a visibly poor citizen — it cannot be tiled usefully. The layout is
already width-aware (`MaxContentWidth` exists and is applied), so this may be closer to
a config change than a redesign. Needs measuring on an iPad, not asserting.

### 11. A reading is the most shareable thing the app makes, and cannot be shared — LOW

An Insights reading is written as an article about the user's own quarter. There is no
`Share`, no `expo-sharing`, no `expo-clipboard` anywhere in `src/`. Neither is there
`expo-store-review`, so the app never asks for a rating — and it has two natural
moments for it (closing a day, and a newly published quarterly reading).

Also absent: `associatedDomains` / universal links, despite qamar360.com existing and
already serving a read-only Progress dashboard.

### 12. No in-app signal that an update arrived — LOW

`expo-updates` is installed and OTA is the release channel, but nothing in `src/` calls
`useUpdates()`, `checkForUpdateAsync` or `reloadAsync`. A user on a stale bundle has no
way to know, and the standing advice is "force-quit twice", which is not something to
ask of a user who cannot see why.

---

## Ranked

| # | Finding | Principle | Effort |
|---|---------|-----------|--------|
| 1 | First-run funnel lost after one to-do | Norman · discoverability | S |
| 2 | Widgets / Lock Screen / Live Activities | Norman · system status | L |
| 3 | iOS dark + tinted app icon | Jakob | S |
| 5 | Predictive back on Android | Jakob | S + device test |
| 8 | FlashList on Discover | Performance as UX | M |
| 6 | Search your own content | Jakob | M |
| 7 | One place that teaches the nouns | Norman · conceptual model | S |
| 4 | Liquid Glass on the toast | 2026 native | S + device test |
| 9 | One date locale | Consistency | XS |
| 12 | Update-available signal | Norman · feedback | S |
| 11 | Share a reading; review prompt | Jakob | S |
| 10 | iPad orientation | 2026 native | M |

If only three are done: **1, 3, 9.** They are small, they are certain, and the first one
is the only finding here that is losing users on day one.
