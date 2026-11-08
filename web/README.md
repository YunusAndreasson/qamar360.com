# qamar360.com

The app's download site, with its privacy policy, terms and support page. It
has no login and no web app. The old web app was retired on 2026-10-26, and
its paths answer with a 301 to `/`.

TanStack Start on Vite, prerendered at build and served as static files by
the `qamar360` Cloudflare Worker, which only answers the old paths and the 404.

```sh
pnpm install --frozen-lockfile
pnpm dev      # http://localhost:3000
pnpm verify   # Vitest, tsc and the prerendered build
```

How the page is laid out, how its photographs and app screens are made, and
the rules for copy and motion are in [AGENTS.md](AGENTS.md) and
[docs/website-plan.md](../docs/website-plan.md).
