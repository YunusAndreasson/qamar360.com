import type { MaterialGlyphName } from '@/constants/material-glyphs';

import type { SFSymbol } from 'expo-symbols';


/**
 * A glyph named once, resolved per platform — an SF Symbol on iOS, a Material Symbol on Android —
 * so every icon is native to the OS it renders on, and in the same family as the tab bar and nav
 * headers. Render one through {@link AppIcon} (in-content) or {@link HeaderIconButton} (nav bars).
 *
 * Both names are checked at compile time: every `sf` against the SF Symbols catalog, and every `md`
 * against the generated glyph map (`material-glyphs.ts`, from expo-symbols' own Material Symbols
 * map). A mistyped symbol is a type error, not a blank glyph on device — and an `md` the map does
 * not have yet means `npm run gen:glyphs`.
 *
 * Android used to draw from the classic Material Icons font, with a few Community icons for the
 * sun's positions, while the SDK 58 tab bar drew Material Symbols: two families on one screen.
 * Material Symbols has no separate sunrise and sunset glyphs, so a few moments share one across
 * groups (morning ↔ Fajr, evening ↔ Maghrib) — the same twinning iOS already does for midday ↔
 * Dhuhr and evening ↔ Maghrib, since they name the same solar moment.
 */
export type IconGlyph = { sf: SFSymbol; md: MaterialGlyphName };

/** The app's full icon set, by semantic name. Add new icons here, never inline a raw glyph name. */
export const Icons = {
  // ── Navigation / chrome ────────────────────────────────────────────────
  close: { sf: 'xmark', md: 'close' },
  add: { sf: 'plus', md: 'add' },
  check: { sf: 'checkmark', md: 'check' },
  chevronLeft: { sf: 'chevron.left', md: 'chevron_left' },
  chevronRight: { sf: 'chevron.right', md: 'chevron_right' },
  expandMore: { sf: 'chevron.down', md: 'expand_more' },
  expandLess: { sf: 'chevron.up', md: 'expand_less' },
  ellipsis: { sf: 'ellipsis', md: 'more_horiz' },
  // ── Stacks / links ─────────────────────────────────────────────────────
  link: { sf: 'link', md: 'link' },
  addLink: { sf: 'link.badge.plus', md: 'add_link' },
  stack: { sf: 'square.stack.3d.up', md: 'stacks' },
  // An exchange: one thing going out as another comes in. Two arrows passing, not a cycle —
  // nothing here repeats, and a refresh glyph would say the wrong thing entirely.
  exchange: { sf: 'arrow.left.arrow.right', md: 'swap_horiz' },
  // A one-off task: a written list with things struck off it. Not a checkmark — that glyph is
  // "done" everywhere else in the app, and this names the kind of thing, not its state.
  task: { sf: 'checklist', md: 'checklist' },
  // A habit that belongs to no stack: the thing that recurs, with nothing it hangs off. A cycle is
  // right here where it would be wrong for an exchange — this one genuinely comes round again.
  repeat: { sf: 'repeat', md: 'repeat' },
  openInNew: { sf: 'arrow.up.right', md: 'open_in_new' },
  globe: { sf: 'globe', md: 'public' },
  // ── Habit actions ──────────────────────────────────────────────────────
  skip: { sf: 'minus.circle', md: 'do_not_disturb_on' },
  undo: { sf: 'arrow.uturn.backward', md: 'undo' },
  edit: { sf: 'pencil', md: 'edit' },
  // Per-habit and per-stack stats — the ⋯ sheet's "Stats" action and its empty state.
  stats: { sf: 'chart.bar.xaxis', md: 'bar_chart' },
  // One delete glyph, outlined like the rest of the row glyphs — Android used to mix a filled
  // `delete` on the sheets with an outlined one in Settings for the same act.
  delete: { sf: 'trash', md: 'delete' },
  // ── Appearance / brand / moment emblems ────────────────────────────────
  // `sun` and `moon` double as the midday / night stack emblems on Today; the whole moment
  // set (lib/moments.ts) draws from this block. Near-twins across groups (dhuhr↔sun,
  // maghrib↔sunset on iOS) are deliberate — they name the same solar moment.
  moon: { sf: 'moon.fill', md: 'dark_mode' },
  sun: { sf: 'sun.max.fill', md: 'light_mode' },
  sunrise: { sf: 'sunrise.fill', md: 'wb_twilight' },
  sunset: { sf: 'sunset.fill', md: 'brightness_4' },
  // Waking up = sun through morning haze — an alarm clock was "logical but looks terrible"
  // (user): a mechanical object breaks the celestial family the other emblems live in.
  wake: { sf: 'sun.haze.fill', md: 'routine' },
  preDawn: { sf: 'moon.haze.fill', md: 'nights_stay' },
  fajr: { sf: 'sun.horizon.fill', md: 'wb_twilight' },
  // Ḍuḥā is the sun *clear of* the horizon and still climbing — so on iOS it takes the horizon
  // glyph Fajr wears and lifts the sun off it; read down the column the three make the morning's
  // actual arc: at the horizon, above it, overhead. Material Symbols draws no horizons, so Android
  // says the same arc in suns: twilight, a clear day, full sun — and ʿAṣr the dimmer one.
  duha: { sf: 'sun.and.horizon.fill', md: 'clear_day' },
  dhuhr: { sf: 'sun.max.fill', md: 'sunny' },
  asr: { sf: 'sun.min.fill', md: 'brightness_5' },
  maghrib: { sf: 'sunset.fill', md: 'brightness_4' },
  isha: { sf: 'moon.stars.fill', md: 'moon_stars' },
  jumuah: { sf: 'person.3.fill', md: 'groups' },
  appearanceAuto: { sf: 'circle.lefthalf.filled', md: 'brightness_auto' },
  bedtime: { sf: 'moon.zzz.fill', md: 'bedtime' },
  // ── States / settings ──────────────────────────────────────────────────
  searchOff: { sf: 'magnifyingglass', md: 'search_off' },
  cloudOff: { sf: 'icloud.slash', md: 'cloud_off' },
  notifications: { sf: 'bell', md: 'notifications' },
  notificationsOff: { sf: 'bell.slash', md: 'notifications_off' },
  lock: { sf: 'lock', md: 'lock' },
  signOut: { sf: 'rectangle.portrait.and.arrow.right', md: 'logout' },
  privacy: { sf: 'hand.raised.fill', md: 'privacy_tip' },
  document: { sf: 'doc.text', md: 'description' },
  help: { sf: 'questionmark.circle', md: 'help' },
  // "More about what you're looking at" — distinct from `help`, which offers assistance. The
  // Progress hero wears this to say the orbit can be read, and that a reading is available.
  info: { sf: 'info.circle', md: 'info' },
  reset: { sf: 'arrow.counterclockwise', md: 'restart_alt' },
  calendar: { sf: 'calendar', md: 'calendar_today' },
  // The account photo — a picture, not a camera: the app opens the library, it never takes a shot.
  photo: { sf: 'photo', md: 'photo' },
  // The device itself buzzing — the only mechanical glyph in the set, and rightly so: haptics
  // are the one setting about the hardware rather than the sky.
  vibration: { sf: 'iphone.radiowaves.left.and.right', md: 'vibration' },
  // Sky motion — the drift, twinkle and meteors, named by what they add rather than by a switch.
  sparkle: { sf: 'sparkles', md: 'auto_awesome' },
  // The day-complete celebration — a seal, the app's word for finishing a whole. It used to wear
  // `moon`, two rows below the lunar updates wearing the same glyph.
  celebrate: { sf: 'checkmark.seal', md: 'verified' },
  // ── Toast / status ─────────────────────────────────────────────────────
  success: { sf: 'checkmark.circle.fill', md: 'check_circle' },
  danger: { sf: 'exclamationmark.triangle.fill', md: 'error' },
} satisfies Record<string, IconGlyph>;

/** A valid key of {@link Icons} — the type any `icon`/`name` prop should use. */
export type IconName = keyof typeof Icons;
