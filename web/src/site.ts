/** Every fact the site states about who runs Qamar360 and where to reach them, named once. */
export const Site = {
  name: 'Qamar360',
  url: 'https://qamar360.com',
  provider: 'Yunus Andreasson',
  country: 'Sweden',
  email: 'contact@qamar360.com',
  instagram: 'https://www.instagram.com/qamar360com/',
  x: 'https://x.com/Qamar360Com',
  // The maker's own GitHub, where the app's code is public.
  github: 'https://github.com/YunusAndreasson',
  // The maker credit: the person who makes Qamar360, and his own site.
  maker: { name: 'Yunus Andreasson', url: 'https://andreassonphoto.com' },
} as const

/** The date the privacy policy, terms and support page last changed. */
export const DOCS_UPDATED = '30 October 2026'
