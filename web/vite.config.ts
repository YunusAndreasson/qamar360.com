import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Modern-browsers-only management console (see the "modern browsers only" note in
// the theme): match esbuild's output baseline to Tailwind v4's CSS target so the
// client bundle ships the syntax we author (ES2022+) instead of being down-levelled
// to Vite's default es2020 / Chrome-87-era baseline.
const MODERN_TARGET = ['chrome111', 'edge111', 'firefox128', 'safari16.4']

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  build: { target: MODERN_TARGET },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    devtools(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
