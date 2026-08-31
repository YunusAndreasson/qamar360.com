import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Qamar360 — Sunnah habits & routines' },
      {
        name: 'description',
        content:
          'Track your Sunnah habits and routines across the lunar cycle — a calm, precise place for daily practice.',
      },
      { name: 'theme-color', content: '#09090b' },
      { name: 'color-scheme', content: 'dark' },
      // Maker identity — pairs with the Person JSON-LD below.
      { name: 'author', content: 'Yunus Andreasson' },
      { name: 'twitter:creator', content: '@YunusAndreasson' },
      { name: 'twitter:card', content: 'summary' },
      // Open Graph / Twitter card — these were entirely missing.
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: 'Qamar360' },
      { property: 'og:title', content: 'Qamar360 — Sunnah habits & routines' },
      {
        property: 'og:description',
        content:
          'Track your Sunnah habits and routines across the lunar cycle — a calm, precise place for daily practice.',
      },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/qamar-mark.svg', type: 'image/svg+xml' },
    ],
    scripts: [
      // Person JSON-LD — identical @id across every one of the maker's sites so search engines
      // resolve them to one entity. Emitted as its own ld+json block (no Organization/WebSite
      // graph exists here to merge a `creator` reference into).
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
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {/* Devtools are a build-time thing only — never ship the panel/badge to production. */}
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{
              position: 'bottom-right',
            }}
            plugins={[
              {
                name: 'Tanstack Router',
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  )
}
