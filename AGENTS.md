# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Verification

`npm run verify` (alias for `npm run validate`: typecheck + lint + deadcode +
test) — run before finishing a task. The web app has its own: `cd web && pnpm verify`.

# Web app

The website (qamar360.com) lives in `web/` — Vite + TanStack Start on a
Cloudflare Worker. Deploy: `cd web && pnpm deploy` (vite build + wrangler
deploy). Details in `web/CLAUDE.md`.
