import { defineConfig } from 'vitest/config'

// Standalone config so vitest does not load vite.config.ts — the Cloudflare
// plugin there sets worker-environment options vitest is incompatible with.
export default defineConfig({
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
  },
})
