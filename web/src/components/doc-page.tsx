import type { ReactNode } from 'react'

import { SiteFooter, SiteHeader } from '#/components/site-chrome'
import { DOCS_UPDATED, Site } from '#/site'

/** A document page's `<head>`: its title and description. */
export function docHead(title: string, description: string) {
  return {
    meta: [
      { title: `${title} · ${Site.name}` },
      { name: 'description', content: description },
      { property: 'og:title', content: `${title} · ${Site.name}` },
      { property: 'og:description', content: description },
    ],
  }
}

/** The frame shared by the privacy policy, terms and support page: one readable column. */
export function DocPage({ title, lede, children }: { title: string; lede: ReactNode; children: ReactNode }) {
  return (
    <div className="doc-page">
      <SiteHeader />
      <main className="doc">
        <h1>{title}</h1>
        <p className="doc-updated">Updated {DOCS_UPDATED}</p>
        <p className="doc-lede">{lede}</p>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
