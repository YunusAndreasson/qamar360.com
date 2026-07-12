/**
 * External links surfaced in Settings. The privacy/terms/support trio are PLACEHOLDERS — replace
 * them with the real URLs (or delete the matching rows in `src/app/(tabs)/settings/index.tsx`)
 * before shipping. The `maker` byline links to the maker's projects page, which lists his other
 * apps — so this app doesn't have to. All are opened in an in-app browser via `expo-web-browser`,
 * so they must be `https://` URLs.
 */
export const Links = {
  privacy: 'https://qamar360.com/privacy',
  terms: 'https://qamar360.com/terms',
  support: 'https://qamar360.com/support',

  // The maker — the byline links to the projects page that lists everything he builds.
  maker: 'https://andreassonphoto.com/projects',
} as const;
