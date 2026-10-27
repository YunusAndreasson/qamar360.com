import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'

// The two import roots, stated here rather than read from tsconfig (`resolve.tsconfigPaths`). That
// option looks up the tsconfig governing each file, and for one the web tsconfig doesn't include
// (`src/styles.css`) it climbs out of `web/` to the app's own tsconfig, whose `extends:
// "expo/tsconfig.base"` the bundler's resolver cannot follow through Expo's package exports — the
// build failed on it. The website has no business reading the app's config either way.
const SRC = fileURLToPath(new URL('./src/', import.meta.url))

const config = defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: SRC },
      { find: /^#\//, replacement: SRC },
    ],
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    // Every page is the same for every visitor (tonight's moon and the scroll plays run in the
    // browser), so each is rendered once at build time and served as a static file from the edge.
    // The Worker still answers what is not a file: the retired web app's 301s and the 404.
    tanstackStart({ prerender: { enabled: true, crawlLinks: true, autoSubfolderIndex: false } }),
    viteReact(),
  ],
})

export default config
