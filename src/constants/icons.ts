import type { HeaderIcon } from '@/components/header-icon-button';

/**
 * Shared native header glyphs — named once, resolved per platform (SF Symbol on iOS,
 * Material on Android). Keeps the same icon identical everywhere it appears in a nav bar.
 */
export const HeaderIcons = {
  add: { sf: 'plus', material: 'add' },
  stepBack: { sf: 'chevron.left', material: 'chevron-left' },
  stepForward: { sf: 'chevron.right', material: 'chevron-right' },
} satisfies Record<string, HeaderIcon>;
