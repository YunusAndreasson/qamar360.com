/**
 * Every external URL the app surfaces, named once so a link is defined in a single place (the
 * settings rows and the {@link SocialLinks} footer both read from here). The privacy/terms/support
 * trio are PLACEHOLDERS — replace them with the real pages (or delete the matching rows in
 * `src/app/(tabs)/settings/index.tsx`) before shipping. All are opened in an in-app browser via
 * `expo-web-browser`, so they must be `https://` URLs.
 */
export const Links = {
  privacy: 'https://qamar360.com/privacy',
  terms: 'https://qamar360.com/terms',
  support: 'https://qamar360.com/support',

  // The product's own online presence — the site and the official social accounts.
  website: 'https://qamar360.com',
  instagram: 'https://www.instagram.com/qamar360com/',
  x: 'https://x.com/Qamar360Com',

  // The maker — the byline links to the projects page that lists everything he builds.
  maker: 'https://andreassonphoto.com/projects',
} as const;
