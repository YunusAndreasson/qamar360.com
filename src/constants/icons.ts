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
 */
export type IconGlyph = { sf: SFSymbol; material: keyof typeof MaterialIcons.glyphMap };

/** The app's full icon set, by semantic name. Add new icons here, never inline a raw glyph name. */
export const Icons = {
  // ── Navigation / chrome ────────────────────────────────────────────────
  add: { sf: 'plus', material: 'add' },
  remove: { sf: 'minus', material: 'remove' },
  check: { sf: 'checkmark', material: 'check' },
  close: { sf: 'xmark', material: 'close' },
  chevronLeft: { sf: 'chevron.left', material: 'chevron-left' },
  chevronRight: { sf: 'chevron.right', material: 'chevron-right' },
  expandMore: { sf: 'chevron.down', material: 'expand-more' },
  expandLess: { sf: 'chevron.up', material: 'expand-less' },
  ellipsis: { sf: 'ellipsis', material: 'more-horiz' },
  // ── Stacks / links ─────────────────────────────────────────────────────
  link: { sf: 'link', material: 'link' },
  addLink: { sf: 'link.badge.plus', material: 'add-link' },
  stack: { sf: 'square.stack.3d.up', material: 'layers' },
  openInNew: { sf: 'arrow.up.right', material: 'open-in-new' },
  addCircle: { sf: 'plus.circle', material: 'add-circle-outline' },
  // ── Habit actions ──────────────────────────────────────────────────────
  skip: { sf: 'minus.circle', material: 'do-not-disturb-on' },
  undo: { sf: 'arrow.uturn.backward', material: 'undo' },
  edit: { sf: 'pencil', material: 'edit' },
  delete: { sf: 'trash', material: 'delete' },
  deleteOutline: { sf: 'trash', material: 'delete-outline' },
  // ── Appearance / brand ─────────────────────────────────────────────────
  moon: { sf: 'moon.fill', material: 'dark-mode' },
  sun: { sf: 'sun.max.fill', material: 'light-mode' },
  appearanceAuto: { sf: 'circle.lefthalf.filled', material: 'brightness-auto' },
  bedtime: { sf: 'moon.zzz.fill', material: 'bedtime' },
  // ── States / settings ──────────────────────────────────────────────────
  searchOff: { sf: 'magnifyingglass', material: 'search-off' },
  cloudOff: { sf: 'icloud.slash', material: 'cloud-off' },
  notifications: { sf: 'bell', material: 'notifications' },
  notificationsOff: { sf: 'bell.slash', material: 'notifications-off' },
  lock: { sf: 'lock', material: 'lock-outline' },
  signOut: { sf: 'rectangle.portrait.and.arrow.right', material: 'logout' },
  info: { sf: 'info.circle', material: 'info-outline' },
  privacy: { sf: 'hand.raised.fill', material: 'privacy-tip' },
  document: { sf: 'doc.text', material: 'description' },
  help: { sf: 'questionmark.circle', material: 'help-outline' },
  reset: { sf: 'arrow.counterclockwise', material: 'restart-alt' },
  // ── Toast / status ─────────────────────────────────────────────────────
  success: { sf: 'checkmark.circle.fill', material: 'check-circle' },
  danger: { sf: 'exclamationmark.triangle.fill', material: 'error-outline' },
} satisfies Record<string, IconGlyph>;

/** A valid key of {@link Icons} — the type any `icon`/`name` prop should use. */
export type IconName = keyof typeof Icons;
