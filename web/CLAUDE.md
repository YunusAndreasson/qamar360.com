# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working in `web/`.

## Overview

Marketing/web app for Qamar360, built with Vite + TanStack Start
(`@tanstack/react-start`), deployed as the **`qamar360` Cloudflare Worker**
serving qamar360.com and www.qamar360.com (config in `wrangler.jsonc`).
The Expo mobile app lives at the repo root and has a separate release flow.

## Commands

```bash
pnpm dev              # vite dev --port 3000
pnpm build            # vite build
pnpm test             # vitest run
pnpm generate-routes  # tsr generate (TanStack Router route tree)
pnpm verify           # test + build (full check — run before finishing)
pnpm deploy           # vite build + wrangler deploy (see Deploy)
```

## Deploy

`pnpm deploy` builds with Vite and runs `wrangler deploy`, pushing the
`qamar360` Worker to the custom domains above. Requires wrangler auth
(`wrangler login`).
