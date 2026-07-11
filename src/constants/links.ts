/**
 * External links surfaced in Settings. The privacy/terms/support trio are PLACEHOLDERS — replace
 * them with the real URLs (or delete the matching rows in `src/app/(tabs)/settings/index.tsx`)
 * before shipping. The `maker` + socials + sibling-app links back the "More from the maker" section
 * and are final. All are opened in an in-app browser via `expo-web-browser`, so they must be
 * `https://` URLs.
 */
export const Links = {
  privacy: 'https://qamar360.com/privacy',
  terms: 'https://qamar360.com/terms',
  support: 'https://qamar360.com/support',

  // The maker — the byline links to the hub page that ties the whole identity together.
  maker: 'https://andreassonphoto.com/about',
  github: 'https://github.com/YunusAndreasson',
  x: 'https://x.com/YunusAndreasson',
  instagram: 'https://www.instagram.com/andreasson.photo/',
  linkedin: 'https://www.linkedin.com/in/yunusandreasson/',

  // Sibling apps in the Islamic cluster (qamar360 itself is intentionally excluded).
  islamSe: 'https://islam.se',
  openArabic: 'https://openarabic.io',
  alIbadah: 'https://al-ibadah.com',
  zuhdNews: 'https://zuhd.news',
} as const;
