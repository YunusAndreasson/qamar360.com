import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'

import { SiteFooter, SiteHeader } from '#/components/site-chrome'
import { Starfield } from '#/components/starfield'
import { Site } from '#/site'
import interFont from '#/fonts/inter-4.1.1.woff2?url'
import siteCss from '#/site.css?url'

const DESCRIPTION =
  'Qamar360 helps you keep the Sunnah without reminders. You tie small acts to the prayers, and see each Hijri month’s progress as an orbit around the moon.'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { title: Site.name },
      { name: 'description', content: DESCRIPTION },
      // The site is night only; match the browser chrome to it.
      { name: 'theme-color', content: '#060910' },
      { name: 'color-scheme', content: 'dark' },
      { name: 'author', content: Site.provider },
      { name: 'twitter:creator', content: '@YunusAndreasson' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: Site.url },
      { property: 'og:image', content: `${Site.url}/og.jpg` },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: 'A man walks alone down a wet cobbled street at dusk, under a thin crescent moon.' },
      { property: 'og:site_name', content: Site.name },
      { property: 'og:title', content: Site.name },
      { property: 'og:description', content: DESCRIPTION },
    ],
    links: [
      // The one font file, fetched alongside the stylesheet rather than after it. Vite fingerprints
      // it, so it can be cached for good (`public/_headers`) and a re-cut font gets a new name.
      { rel: 'preload', href: interFont, as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: siteCss },
      // The app's icon (assets/logo/qamar-icon.svg): the SVG for tabs, the .ico for whatever asks for
      // /favicon.ico (sized, so browsers that read SVG prefer it), a 180px tile for iOS home
      // screens, and the manifest's 192/512 and maskable icons for Android.
      // `?v=` names the drawing: browsers keep a favicon in their own cache past any header, so a
      // redrawn icon needs a new address to be fetched at all. Bump it when the icon changes.
      { rel: 'icon', href: '/favicon.ico?v=2', sizes: '32x32' },
      { rel: 'icon', href: '/favicon.svg?v=2', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
    ],
    scripts: [
      // Person JSON-LD — identical @id across every one of the maker's sites so search engines
      // resolve them to one entity.
      {
        type: 'application/ld+json',
        children: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Person',
          '@id': 'https://andreassonphoto.com/#person',
          name: 'Yunus Andreasson',
          alternateName: ['Jonas Yūnus Andrèasson'],
          url: 'https://andreassonphoto.com',
          sameAs: [
            'https://github.com/YunusAndreasson',
            'https://x.com/YunusAndreasson',
            'https://www.instagram.com/andreasson.photo/',
            'https://www.linkedin.com/in/yunusandreasson/',
          ],
        }),
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Starfield />
        <div className="horizon" aria-hidden />
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <div className="doc-page holding-page">
      <SiteHeader />
      <main className="holding">
        <h1>Nothing here.</h1>
        <p className="holding-lede">
          This address leads nowhere. <Link to="/">Go to the home page</Link>.
        </p>
      </main>
      <SiteFooter />
    </div>
  )
}
