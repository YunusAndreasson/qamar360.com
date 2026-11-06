import { SiteFooter, SiteHeader } from '#/components/site-chrome'
import { DOCS_UPDATED, Site } from '#/site'

import type { ReactNode } from 'react'

/** A document page's `<head>`: its title, its description and its own address. */
export function docHead(title: string, description: string) {
  const url = `${Site.url}/${title.toLowerCase()}`
  return {
    meta: [
      { title: `${title} · ${Site.name}` },
      { name: 'description', content: description },
      { property: 'og:title', content: `${title} · ${Site.name}` },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}

/** A place in the app's menus, such as Settings › Delete account: read as one name, so a line never
 *  breaks inside it. */
export function Menu({ children }: { children: ReactNode }) {
  return <strong className="doc-menu">{children}</strong>
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
