import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { SFSymbol } from 'expo-symbols';

/**
 * A glyph named once, resolved per platform — an SF Symbol on iOS, a Material icon on Android —
 * so every icon is native to the OS it renders on (matching the tab bar and nav headers). Render
 * one through {@link AppIcon} (in-content) or {@link HeaderIconButton} (nav bars).
 *
 * Because {@link Icons} is declared `satisfies Record<string, IconGlyph>`, every `sf` is checked
 * against the SF Symbols catalog at compile time — a mistyped symbol is a type error, not a blank
 * glyph on device.
 *
 * The Android glyph normally comes from classic MaterialIcons; a `materialCommunity` entry pulls
 * from MaterialCommunityIcons instead — used only where the classic set can't distinguish (the
 * sun-position family: sunrise vs sunset vs low sun has one 'wb-twilight' in the classic set).
 */
export type IconGlyph =
  | { sf: SFSymbol; material: keyof typeof MaterialIcons.glyphMap }
  | { sf: SFSymbol; materialCommunity: keyof typeof MaterialCommunityIcons.glyphMap };

/** The app's full icon set, by semantic name. Add new icons here, never inline a raw glyph name. */
export const Icons = {
  // ── Navigation / chrome ────────────────────────────────────────────────
  close: { sf: 'xmark', material: 'close' },
  add: { sf: 'plus', material: 'add' },
  // Today's reflection — the journal entry you write for the day. A page ruled with
  // lines, which is what this was, reads as something to be READ; the pencil breaking the frame
  // says "write" instead. (It was also the same silhouette as `calendar` at header size, back
  // when a calendar glyph held the other end of Today's bar — that end is now the moon.)
  note: { sf: 'square.and.pencil', material: 'edit-square' },
  check: { sf: 'checkmark', material: 'check' },
  chevronLeft: { sf: 'chevron.left', material: 'chevron-left' },
  chevronRight: { sf: 'chevron.right', material: 'chevron-right' },
  expandMore: { sf: 'chevron.down', material: 'expand-more' },
  expandLess: { sf: 'chevron.up', material: 'expand-less' },
  ellipsis: { sf: 'ellipsis', material: 'more-horiz' },
  // ── Stacks / links ─────────────────────────────────────────────────────
  link: { sf: 'link', material: 'link' },
  addLink: { sf: 'link.badge.plus', material: 'add-link' },
  stack: { sf: 'square.stack.3d.up', material: 'layers' },
  // An exchange: one thing going out as another comes in. Two arrows passing, not a cycle —
  // nothing here repeats, and a refresh glyph would say the wrong thing entirely.
  exchange: { sf: 'arrow.left.arrow.right', material: 'swap-horiz' },
  // A one-off task: a written list with things struck off it. Not a checkmark — that glyph is
  // "done" everywhere else in the app, and this names the kind of thing, not its state.
  task: { sf: 'checklist', material: 'checklist' },
  // A plan: something written down that has no day yet. A map, because the noun this names is a
  // route you have worked out but not set off on — and because every calendar glyph would promise
  // exactly the date a plan is defined by not having.
  plan: { sf: 'map', material: 'map' },
  // A habit that belongs to no stack: the thing that recurs, with nothing it hangs off. A cycle is
  // right here where it would be wrong for an exchange — this one genuinely comes round again.
  repeat: { sf: 'repeat', material: 'repeat' },
  // A check-in: a goal asking where you are. A gauge, because what it wants is a *reading* — where
  // a number currently sits, not whether something was done. Deliberately not `checklist` (that is
  // the to-do's, and this is not a list), not a checkmark (the app's "done" everywhere) and not a
  // chart (the graph a goal draws FROM these, which is a different thing from the asking).
  checkIn: { sf: 'gauge.with.dots.needle.bottom.50percent', material: 'speed' },
  // A goal: a horizon over acts you already keep. A flag — a marker planted where you mean to
  // arrive — rather than a target or a bullseye, which would make a twenty-year practice sound
  // like something you aim at and hit. Distinct from `checkIn`'s gauge: that one is the goal
  // ASKING, this one is the goal itself.
  goal: { sf: 'flag', material: 'flag' },
  openInNew: { sf: 'arrow.up.right', material: 'open-in-new' },
  globe: { sf: 'globe', material: 'public' },
  // ── Habit actions ──────────────────────────────────────────────────────
  skip: { sf: 'minus.circle', material: 'do-not-disturb-on' },
  undo: { sf: 'arrow.uturn.backward', material: 'undo' },
  edit: { sf: 'pencil', material: 'edit' },
  // Per-habit and per-stack stats — the ⋯ sheet's "Stats" action and its empty state. NOT the
  // Insights tab, which is the moon's own; that one is a tab-bar glyph, written inline there.
  stats: { sf: 'chart.bar.xaxis', material: 'insights' },
  delete: { sf: 'trash', material: 'delete' },
  deleteOutline: { sf: 'trash', material: 'delete-outline' },
  // ── Appearance / brand / moment emblems ────────────────────────────────
  // `sun` and `moon` double as the midday / night stack emblems on Today; the whole moment
  // set (lib/moments.ts) draws from this block. Near-twins across groups (dhuhr↔sun,
  // maghrib↔sunset on iOS) are deliberate — they name the same solar moment.
  moon: { sf: 'moon.fill', material: 'dark-mode' },
  sun: { sf: 'sun.max.fill', material: 'light-mode' },
  sunrise: { sf: 'sunrise.fill', material: 'wb-twilight' },
  sunset: { sf: 'sunset.fill', material: 'brightness-4' },
  // Waking up = sun through morning haze — an alarm clock was "logical but looks terrible"
  // (user): a mechanical object breaks the celestial family the other emblems live in.
  wake: { sf: 'sun.haze.fill', materialCommunity: 'weather-hazy' },
  preDawn: { sf: 'moon.haze.fill', material: 'nights-stay' },
  fajr: { sf: 'sun.horizon.fill', materialCommunity: 'weather-sunset-up' },
  // Ḍuḥā is the sun *clear of* the horizon and still climbing — so it takes the horizon glyph
  // Fajr wears and lifts the sun off it, and the arrowless Android sunrise/sunset (Fajr and
  // Maghrib take the up- and down-arrow variants). Read down the column the three make the
  // morning's actual arc: at the horizon, above it, overhead.
  duha: { sf: 'sun.and.horizon.fill', materialCommunity: 'weather-sunset' },
  dhuhr: { sf: 'sun.max.fill', materialCommunity: 'white-balance-sunny' },
  asr: { sf: 'sun.min.fill', materialCommunity: 'sun-angle' },
  maghrib: { sf: 'sunset.fill', materialCommunity: 'weather-sunset-down' },
  isha: { sf: 'moon.stars.fill', materialCommunity: 'weather-night' },
  jumuah: { sf: 'person.3.fill', material: 'groups' },
  appearanceAuto: { sf: 'circle.lefthalf.filled', material: 'brightness-auto' },
  bedtime: { sf: 'moon.zzz.fill', material: 'bedtime' },
  // ── States / settings ──────────────────────────────────────────────────
  searchOff: { sf: 'magnifyingglass', material: 'search-off' },
  cloudOff: { sf: 'icloud.slash', material: 'cloud-off' },
  notifications: { sf: 'bell', material: 'notifications' },
  notificationsOff: { sf: 'bell.slash', material: 'notifications-off' },
  lock: { sf: 'lock', material: 'lock-outline' },
  signOut: { sf: 'rectangle.portrait.and.arrow.right', material: 'logout' },
  privacy: { sf: 'hand.raised.fill', material: 'privacy-tip' },
  document: { sf: 'doc.text', material: 'description' },
  help: { sf: 'questionmark.circle', material: 'help-outline' },
  // "More about what you're looking at" — distinct from `help`, which offers assistance. The
  // Progress hero wears this to say the orbit can be read, and that a reading is available.
  info: { sf: 'info.circle', material: 'info-outline' },
  reset: { sf: 'arrow.counterclockwise', material: 'restart-alt' },
  calendar: { sf: 'calendar', material: 'calendar-today' },
  // The account photo — a picture, not a camera: the app opens the library, it never takes a shot.
  photo: { sf: 'photo', material: 'photo' },
  // The device itself buzzing — the only mechanical glyph in the set, and rightly so: haptics
  // are the one setting about the hardware rather than the sky.
  vibration: { sf: 'iphone.radiowaves.left.and.right', material: 'vibration' },
  // Sky motion — the drift, twinkle and meteors, named by what they add rather than by a switch.
  sparkle: { sf: 'sparkles', material: 'auto-awesome' },
  // ── Toast / status ─────────────────────────────────────────────────────
  success: { sf: 'checkmark.circle.fill', material: 'check-circle' },
  danger: { sf: 'exclamationmark.triangle.fill', material: 'error-outline' },
} satisfies Record<string, IconGlyph>;

/** A valid key of {@link Icons} — the type any `icon`/`name` prop should use. */
export type IconName = keyof typeof Icons;
