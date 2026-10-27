import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'

import { SiteFooter, SiteHeader } from '#/components/site-chrome'
import { Site } from '#/site'
import siteCss from '#/site.css?url'

const DESCRIPTION =
  'Qamar360 ties small acts of the Sunnah to moments you already keep, and shows each Hijri month as one orbit of the moon.'

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
      // The one font file, fetched alongside the stylesheet rather than after it.
      { rel: 'preload', href: '/fonts/inter-4.1.1.woff2', as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: siteCss },
      { rel: 'icon', href: '/qamar-mark.svg', type: 'image/svg+xml' },
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
