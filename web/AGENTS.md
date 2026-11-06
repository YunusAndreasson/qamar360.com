# Website

qamar360.com: the site that promotes the app's download, plus its privacy
policy, terms and support page. Built with Vite + TanStack Start
(`@tanstack/react-start`), deployed as the **`qamar360` Cloudflare Worker**
serving qamar360.com and www.qamar360.com (config in `wrangler.jsonc`). Plan:
`docs/website-plan.md` at the repo root. The Expo mobile app lives at the repo
root and has a separate release flow.

There is no login and no web app. The old web app (sign-in, habits, routines,
discover, progress) was retired on 2026-10-26; `src/server.ts` (the worker
entry, `main` in `wrangler.jsonc`) answers its old paths with a 301 to `/`.

## Layout

- `src/site.css`: the only stylesheet. Plain CSS, no Tailwind; colours are the
  app's dark roles. Dark only. On the home page, write a size that should grow on
  a large screen as `calc(N * var(--u))` (`--u` is a pixel up to 1440 and grows to
  1.4 at 2016), never a new fixed cap; the rules are under "Fit and scale" in
  `docs/website-plan.md`.
- `src/site.ts`: who runs the app, the contact address, the social links, and
  the date the documents last changed (`DOCS_UPDATED`).
- `src/routes/privacy.tsx`, `terms.tsx`, `support.tsx`: written from what the
  app does. The privacy page lists the repo source of each claim at its top;
  when the app changes what it stores, change the page and `DOCS_UPDATED`.
- `src/routes/index.tsx`: the download page, told as one story in two halves,
  each played by the scroll through one pinned stage (`lib/play.ts` holds the
  shared hold-and-ease maths):
  - each half opens on one real body with one live line: today's sun
    (`today-sun.tsx`: a visible-light photograph from NASA's Solar Dynamics
    Observatory, made into `public/sun/` by `scripts/sun-image.py`, and the next
    prayer where the visitor is, the place taken from the time zone as the app's
    sky does, via `lib/tz-coords.ts`, a copy of the app's generated table loaded
    on demand; the solar maths in `lib/sun.ts`, tested against astronomy-engine)
    and tonight's moon in its phase. Neither shows a clock time: the app gives
    the prayers none;
  - the sun: `DayPlay` (`day-play.tsx`), the real sun travelling its arc
    (`sun-path.tsx`) and lighting its sky (`skyAt`) as it rests on each prayer,
    while that prayer's curated stack ticks on a port of Today (`stack-card.tsx`:
    stack card and the day-complete card);
  - the moon: `MonthOrbit`, the app's Progress orbit (`orbit.tsx`) round the
    real moon (`moon-canvas.tsx`, the app's Skia moon shader ported to WebGL2
    over `public/moon/near-side.png`, the app's NASA texture), played through
    one Shaʿbān.

  A played stage must fit the screen a browser really leaves (390×664, 375×553):
  its words and cards keep their size and its picture takes what is left, read as
  `100cqh`. Never size the picture from the viewport alone, or the stage cuts off
  at both ends on a real phone.

  `components/story.tsx` holds the chapter cards, passages and verses; the
  order and pace rules are in `docs/website-plan.md`. Keep what the page draws
  in step with the app: the orbit's proportions, colours and notification
  wording (`orbit-drawing.tsx`, `moon-body.tsx`, `lib/lunar-update.ts`); the
  stack card's look (`stack-card.tsx`, `act-row.tsx`, `completion-ring.tsx`,
  `day-complete.tsx`); and the act names, word for word from
  `constants/sunnah-habits.ts`. Each act's source on the page is checked on
  sunnah.com.
- `src/lib/moon.ts`: phase and Umm al-Qura maths ported from the app, tested.
- `src/components/starfield.tsx` + `src/lib/stars.ts`: the stars behind every page, one WebGL2
  canvas fixed under `<body>` (mounted in `__root.tsx`). It sets the scene, so keep it dim and
  slow: a seeded blue-noise tile in three depths, moving with the scroll, a slow drift and a
  twinkle on the faint stars. It renders every frame only while easing, about 15 a second at rest,
  and one still frame under reduced motion. No second moon in it (the app's rule). Because it lies
  under the content, no page or section may paint an opaque night background. Fade photographs
  into the night with `mask-image`, not with a shade to `--night`.
- Motion: the rules and the list of what moves are in `docs/website-plan.md` §Motion. The
  tokens (`--ease`, `--rise`, the `--t-*` paces, `--follow`, `--stagger`) sit in `:root` and the
  two patterns, *arrive* and *develop*, under "Motion" in `site.css`. Give an element a class
  (`.reveal`, `.develop`) and at most a `--pace`/`--wait`; never a literal duration or curve.
  Every hidden-until-seen state sits under `.reveals`, the class `useReveal` puts on the root
  (`routes/index.tsx`), so without JS, or under reduced motion, everything simply shows. The
  home page's dusk and dawn come from the starfield (`--dusk`/`--dawn` on `.horizon`, from
  `nightLight` in `lib/play.ts`).
- `src/fonts/inter-4.1.1.woff2`: the text font (fingerprinted by Vite, so cached for good), Inter 4.1 variable (optical size + weight) cut by
  `scripts/subset-font.sh` to Latin, the transliteration letters (ā ī ū ḍ ḥ ṣ ṭ ẓ ʾ ʿ) and the
  OpenType features the CSS uses; preloaded from `__root.tsx`. A copy character outside that set
  falls back to Arial: add it to the script's `--unicodes` and re-run (needs fonttools + brotli).
  Firefox has no `text-wrap: pretty`, so body lines tie their last two words with `&nbsp;`.
- `src/fonts/honorific.woff2`: the one Arabic sign the site sets, ﷺ after the Prophet's name, cut
  from Noto Sans Arabic by the same script. Its `@font-face` (`'Honorific'`, first in `--font`) has
  `unicode-range: U+FDFA`, so it is fetched only where the sign appears, sized a fifth over the text
  with Inter's line metrics divided to match. Write `Prophet\u00a0ﷺ` so it never wraps alone.
- Icons, all from the app's `assets/logo/qamar-icon.svg` (a white Q on the night
  `#060910`): `favicon.svg` (tabs; drawn for a tab's pixel grid: stroke 112 for the app's 40,
  the ring's outer edge on whole pixels at 16/32/48 and a longer tail, so 16px reads as a Q and
  not a grey ring with a speck), `favicon.ico` (16/32/48 rendered from it by `rsvg-convert` +
  `magick`, for whatever asks for `/favicon.ico`),
  `apple-touch-icon.png` (180, opaque square: iOS rounds it), and the manifest's
  `icon-192/512.png` and `icon-maskable-512.png` (the app's adaptive mark,
  inside Android's 80% safe circle). `manifest.webmanifest` is `display:
  browser`: this is a site for a native app, not an app to install. When the app
  changes its icon, regenerate these with `rsvg-convert`.
- `public/images`: photographs as `<name>-<width>.avif|webp`. The hero and
  the close are full-bleed; every still between is a `Frame` exported as
  `<name>-wide-*` (2.39:1) and `<name>-tall-*` (4:5, phones). All are one
  night generated with Codex in one style. A still keeps an empty side only
  when its words are set there (`side`); a caption or wordless still is
  composed full. No churches anywhere: no spires, steeples, domes or crosses.
- Every photograph is graded into the app's palette by `scripts/grade-photo.py`
  (CIE Lab): shadows to the night `#060910` and its indigo, sodium orange
  calmed toward moonglow `#F4EACB`, skies off royal navy, the generated
  "HDR clarity" relaxed, a soft shoulder. Grade a new still the same way before
  it goes on the page. No brand marks in any picture (a phone in a still is a
  plain black slab or lies face down).
- A new still is made the way the set was, or it reads as "pure AI" (a raw render
  shown on 2026-11-06 was judged far worse than the set):
  - `scripts/codex-image.sh` renders it with the set's own photographs attached as
    references (the app's `assets/images/guide-*.webp`, a still from the page), from a
    plain description of the scene in `art/prompts/` plus the shared `art/prompts/style.txt`.
    Never "cinematic", a cinematographer's or painter's name, or a saturated sunset: those
    pull the model's stock look (orange-and-teal skies, glossy cobbles, every window lit,
    empty staged rooms). Rooms are lived in.
  - Grade every render, then judge it only beside the stills already on the page, in the
    page's frame with its words, at 100%.
  - Codex renders about 1.6 MP (1672×941 for 16:9, whatever size is asked for). Don't
    sharpen or AI-upscale a still for large screens: sharp generated detail reads as more
    generated, and the set's softness is part of why it does not.
  - Masters (the raw render and the graded one) go in `art/masters/`.
- `maghrib` (under "No alarm went off.") is a man kneeling in the sitting of the
  prayer just after sunset, by the window of the flat in the guide photos; on the
  table a glass and a phone lying face down. It replaced the supper table, which
  read as dinner rather than the prayer. Its dark left edge is widened from its
  own pixels by `scripts/widen-left.py`, so the 2.39:1 crop holds both the sky in
  the window and the rug; the 4:5 crop is `753x941+900+0` of the graded render.
- `scripts/export-photo.sh <png> <name> <widths…>` writes the AVIF and WebP pair.
  AVIF is 10-bit 4:2:0: at 8 bits the smooth near-black of an out-of-focus wall
  breaks into blocks (measured), and 4:2:0 keeps it in AV1's Main profile, which
  every AVIF decoder reads.
- The moon in a photograph must be the real moon of its scene: an evening
  crescent (the hero) is lit on the side of the set sun, the last crescent
  before dawn (the close) is lit toward the glow under it, and the portrait hero
  shows a thin crescent, because its caption says the crescent on the app screen
  (3 Jumādā al-Thānī) is the one in the sky. On desktop the hero's crescent sits
  in the open sky between the headline and the app screen, never behind it.
- The phones in `sill`, `bedside`, `rooftop` and `rug` show real screens:
  Codex draws each phone with its screen blank and black, and a screenshot
  from the emulator is warped onto the glass, so an image model never draws
  the app's UI. The screens come from a seeded showcase account
  (`QAMAR_SHOWCASE_*` in `.argent/secrets.env`), with a demo-mode status bar
  and the emulator's real clock set to the scene's hour. The day-complete card
  turns its Hijri date at Maghrib, so its time has to match.
- Every app screen on the site is captured on the `pixel` AVD (Pixel 6, 1080×2400) with the
  **centred punch-hole cutout** switched on (`cmd overlay enable
  com.android.internal.display.cutout.emulation.emu01`). Without it Android draws the old short
  status bar, and the clock hugs the frame's corner as on no current phone. Then
  `scripts/finish-screen.py` paints out the gesture handle (a stray white stroke in a still; it
  sits on the tab bar's flat night, so the fill is exact) and draws the camera hole where the
  device reports it (a screencap leaves the cutout area as the app drew it). Status bar: demo mode,
  clock set to the scene's hour, Wi-Fi + battery only (`network -e mobile hide` AFTER `wifi show`,
  or the Wi-Fi icon drops). Restore the overlay, clock, theme and demo mode afterwards.
- `hero-screen-*` is a bare screenshot (no photo) shown beside the headline:
  Progress on 3 Jumādā al-Thānī 1448, so the crescent on the phone is the
  crescent in the hero's sky. The phone's clock cannot go back before the
  Supabase certificate's start date (TLS fails), so an earlier day means a
  later month and seeded history up to it.

## Delivery

- Every page is **prerendered** at build (`tanstackStart({ prerender })` in
  `vite.config.ts`) to `dist/client/*.html` (flat files, so `/privacy` is served
  without a trailing-slash redirect) and served by Cloudflare as a static file.
  The Worker (`src/server.ts`) only answers what is not a file: the retired web
  app's 301s and the 404. Nothing on a page may depend on the request; anything
  live (tonight's moon, the scroll plays) runs in the browser.
- `public/_headers` caches `/assets/*` (content-hashed: JS, CSS, the font) for a
  year, `immutable`. It applies to static responses only, never the Worker's.
  Photographs and pages keep Cloudflare's default revalidation, because a
  photograph is re-exported under the same name.
- Browser target: Vite 8's default `baseline-widely-available` (Chrome/Edge
  111, Firefox 114, Safari 16.4). Lightning CSS adds and strips vendor prefixes
  for that target, so write CSS unprefixed (only the non-standard
  `-webkit-font-smoothing` / `-webkit-tap-highlight-color` stay by hand).
- The moon texture is decoded once per page with `createImageBitmap`
  (`colorSpaceConversion: 'none'`), shared by every moon canvas; verified
  texel-exact against the PNG in Gecko and Chromium.
- Headless Chromium logs "GPU stall due to ReadPixels" for any WebGL canvas: it
  is SwiftShader compositing, not the site's code.

## Copy

The app's copy rules apply (no em dash as a connector, objects don't want
things, no templated phrases). Never uppercase "iPhone".

## Commands

```bash
pnpm dev              # vite dev --port 3000
pnpm build            # vite build
pnpm test             # vitest run
pnpm typecheck        # tsc --noEmit
pnpm generate-routes  # tsr generate (TanStack Router route tree)
pnpm preview          # serve the production build in workerd (redirects work here, not in dev)
pnpm verify           # test + typecheck + build (full check — run before finishing)
pnpm deploy           # vite build + wrangler deploy (see Deploy)
```

## Deploy

`pnpm deploy` builds with Vite and runs `wrangler deploy`, pushing the
`qamar360` Worker to the custom domains above. Requires wrangler auth
(`wrangler login`).

## Design

The site follows the same two designers as the app (root `AGENTS.md`):
Dieter Rams, *less, but better* (as little design as possible, nothing on the
page that does not serve the visitor) and Don Norman (discoverability,
feedback, a clear conceptual model). Rams decides what is on the page; Norman
decides how it is found and used.

## TanStack guidance

The block below is generated by TanStack Intent (`npx @tanstack/intent`); edits
inside it are overwritten. Load an entry when the change uses that API and you
are not sure of its current shape, not before every edit. The Next.js
migration and devtools plugin/marketplace/instrumentation entries do not apply
to this app.

<!-- intent-skills:start -->
# TanStack Intent - before editing files, run the matching guidance command.
tanstackIntent:
  - id: "@tanstack/devtools#devtools-app-setup"
    run: "npx @tanstack/intent@latest load @tanstack/devtools#devtools-app-setup"
    for: "Install TanStack Devtools, pick framework adapter (React/Vue/Solid/Preact), register plugins via plugins prop, configure shell (position, hotkeys, theme, hideUntilHover, requireUrlFlag, eventBusConfig). TanStackDevtools component, defaultOpen, localStorage persistence."
  - id: "@tanstack/devtools#devtools-marketplace"
    run: "npx @tanstack/intent@latest load @tanstack/devtools#devtools-marketplace"
    for: "Publish plugin to npm and submit to TanStack Devtools Marketplace. PluginMetadata registry format, plugin-registry.ts, pluginImport (importName, type), requires (packageName, minVersion), framework tagging, multi-framework submissions, featured plugins."
  - id: "@tanstack/devtools#devtools-plugin-panel"
    run: "npx @tanstack/intent@latest load @tanstack/devtools#devtools-plugin-panel"
    for: "Build devtools panel components that display emitted event data. Listen via EventClient.on(), handle theme (light/dark), use @tanstack/devtools-ui components. Plugin registration (name, render, id, defaultOpen), lifecycle (mount, activate, destroy), max 3 active plugins. Two paths: Solid.js core with devtools-ui for multi-framework support, or framework-specific panels."
  - id: "@tanstack/devtools#devtools-production"
    run: "npx @tanstack/intent@latest load @tanstack/devtools#devtools-production"
    for: "Handle devtools in production vs development. removeDevtoolsOnBuild, devDependency vs regular dependency, conditional imports, NoOp plugin variants for tree-shaking, non-Vite production exclusion patterns."
  - id: "@tanstack/devtools-event-client#devtools-bidirectional"
    run: "npx @tanstack/intent@latest load @tanstack/devtools-event-client#devtools-bidirectional"
    for: "Two-way event patterns between devtools panel and application. App-to-devtools observation, devtools-to-app commands, time-travel debugging with snapshots and revert. structuredClone for snapshot safety, distinct event suffixes for observation vs commands, serializable payloads only."
  - id: "@tanstack/devtools-event-client#devtools-event-client"
    run: "npx @tanstack/intent@latest load @tanstack/devtools-event-client#devtools-event-client"
    for: "Create typed EventClient for a library. Define event maps with typed payloads, pluginId auto-prepend namespacing, emit()/on()/onAll()/onAllPluginEvents() API. Connection lifecycle (5 retries, 300ms), event queuing, enabled/disabled state, SSR fallbacks, singleton pattern. Unique pluginId requirement to avoid event collisions."
  - id: "@tanstack/devtools-event-client#devtools-instrumentation"
    run: "npx @tanstack/intent@latest load @tanstack/devtools-event-client#devtools-instrumentation"
    for: "Analyze library codebase for critical architecture and debugging points, add strategic event emissions. Identify middleware boundaries, state transitions, lifecycle hooks. Consolidate events (1 not 15), debounce high-frequency updates, DRY shared payload fields, guard emit() for production. Transparent server/client event bridging."
  - id: "@tanstack/devtools-vite#devtools-vite-plugin"
    run: "npx @tanstack/intent@latest load @tanstack/devtools-vite#devtools-vite-plugin"
    for: "Configure @tanstack/devtools-vite for source inspection (data-tsd-source, inspectHotkey, ignore patterns), console piping (client-to-server, server-to-client, levels), enhanced logging, server event bus (port, host, HTTPS), production stripping (removeDevtoolsOnBuild), editor integration (launch-editor, custom editor.open). Must be FIRST plugin in Vite config. Vite ^6 || ^7 only."
  - id: "@tanstack/react-start#lifecycle/migrate-from-nextjs"
    run: "npx @tanstack/intent@latest load @tanstack/react-start#lifecycle/migrate-from-nextjs"
    for: "Step-by-step migration from Next.js App Router to TanStack Start: route definition conversion, API mapping, server function conversion from Server Actions, middleware conversion, data fetching pattern changes."
  - id: "@tanstack/react-start#react-start"
    run: "npx @tanstack/intent@latest load @tanstack/react-start#react-start"
    for: "React bindings for TanStack Start: createStart, StartClient, StartServer, React-specific imports, re-exports from @tanstack/react-router, full project setup with React, useServerFn hook."
  - id: "@tanstack/react-start#react-start/server-components"
    run: "npx @tanstack/intent@latest load @tanstack/react-start#react-start/server-components"
    for: "Implement, review, debug, and refactor TanStack Start React Server Components in React 19 apps. Use when tasks mention @tanstack/react-start/rsc, renderServerComponent, createCompositeComponent, CompositeComponent, renderToReadableStream, createFromReadableStream, createFromFetch, Composite Components, React Flight streams, loader or query owned RSC caching, router.invalidate, structuralSharing: false, selective SSR, stale names like renderRsc or .validator, or migration from Next App Router RSC patterns. Do not use for generic SSR or non-TanStack RSC frameworks except brief comparison."
  - id: "@tanstack/router-core#router-core"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core"
    for: "Framework-agnostic core concepts for TanStack Router: route trees, createRouter, createRoute, createRootRoute, createRootRouteWithContext, addChildren, Register type declaration, route matching, route sorting, file naming conventions. Entry point for all router skills."
  - id: "@tanstack/router-core#router-core/auth-and-guards"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/auth-and-guards"
    for: "Route protection with beforeLoad, redirect()/throw redirect(), isRedirect helper, authenticated layout routes (_authenticated), non-redirect auth (inline login), RBAC with roles and permissions, auth provider integration (Auth0, Clerk, Supabase), router context for auth state."
  - id: "@tanstack/router-core#router-core/code-splitting"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/code-splitting"
    for: "Automatic code splitting (autoCodeSplitting), .lazy.tsx convention, createLazyFileRoute, createLazyRoute, lazyRouteComponent, getRouteApi for typed hooks in split files, codeSplitGroupings per-route override, splitBehavior programmatic config, critical vs non-critical properties."
  - id: "@tanstack/router-core#router-core/data-loading"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/data-loading"
    for: "Route loader option, loaderDeps for cache keys, staleTime/gcTime/ defaultPreloadStaleTime SWR caching, pendingComponent/pendingMs/ pendingMinMs, errorComponent/onError/onCatch, beforeLoad, router context and createRootRouteWithContext DI pattern, router.invalidate, Await component, deferred data loading with unawaited promises."
  - id: "@tanstack/router-core#router-core/navigation"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/navigation"
    for: "Link component, useNavigate, Navigate component, router.navigate, ToOptions/NavigateOptions/LinkOptions, from/to relative navigation, activeOptions/activeProps, preloading (intent/viewport/render), preloadDelay, navigation blocking (useBlocker, Block), createLink, linkOptions helper, scroll restoration, MatchRoute."
  - id: "@tanstack/router-core#router-core/not-found-and-errors"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/not-found-and-errors"
    for: "notFound() function, notFoundComponent, defaultNotFoundComponent, notFoundMode (fuzzy/root), errorComponent, CatchBoundary, CatchNotFound, isNotFound, NotFoundRoute (deprecated), route masking (mask option, createRouteMask, unmaskOnReload)."
  - id: "@tanstack/router-core#router-core/path-params"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/path-params"
    for: "Dynamic path segments ($paramName), splat routes ($ / _splat), optional params ({-$paramName}), prefix/suffix patterns ({$param}.ext), useParams, params.parse/stringify, pathParamsAllowedCharacters, i18n locale patterns."
  - id: "@tanstack/router-core#router-core/search-params"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/search-params"
    for: "validateSearch, search param validation with Zod/Valibot/ArkType adapters, fallback(), search middlewares (retainSearchParams, stripSearchParams), custom serialization (parseSearch, stringifySearch), search param inheritance, loaderDeps for cache keys, reading and writing search params."
  - id: "@tanstack/router-core#router-core/ssr"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/ssr"
    for: "Non-streaming and streaming SSR, RouterClient/RouterServer, renderRouterToString/renderRouterToStream, createRequestHandler, defaultRenderHandler/defaultStreamHandler, HeadContent/Scripts components, head route option (meta/links/styles/scripts), ScriptOnce, automatic loader dehydration/hydration, memory history on server, data serialization, document head management."
  - id: "@tanstack/router-core#router-core/type-safety"
    run: "npx @tanstack/intent@latest load @tanstack/router-core#router-core/type-safety"
    for: "Full type inference philosophy (never cast, never annotate inferred values), Register module declaration, from narrowing on hooks and Link, strict:false for shared components, getRouteApi for code-split typed access, addChildren with object syntax for TS perf, LinkProps and ValidateLinkOptions type utilities, as const satisfies pattern."
  - id: "@tanstack/router-plugin#router-plugin"
    run: "npx @tanstack/intent@latest load @tanstack/router-plugin#router-plugin"
    for: "TanStack Router bundler plugin for route generation and automatic code splitting. Supports Vite, Webpack, Rspack, and esbuild. Configures autoCodeSplitting, routesDirectory, target framework, and code split groupings."
  - id: "@tanstack/start-client-core#start-core"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core"
    for: "Core overview for TanStack Start: tanstackStart() Vite plugin, getRouter() factory, root route document shell (HeadContent, Scripts, Outlet), client/server entry points, routeTree.gen.ts, tsconfig configuration. Entry point for all Start skills."
  - id: "@tanstack/start-client-core#start-core/auth-server-primitives"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/auth-server-primitives"
    for: "Server-side authentication primitives for TanStack Start: session cookies (HttpOnly, Secure, SameSite, __Host- prefix), session read/issue/destroy via createServerFn and middleware, OAuth authorization-code flow with state and PKCE, password-reset enumeration defense, CSRF for non-GET RPCs, rate limiting auth endpoints, session rotation on privilege change. Pairs with router-core/auth-and-guards for the routing side."
  - id: "@tanstack/start-client-core#start-core/deployment"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/deployment"
    for: "Deploy to Cloudflare Workers, Netlify, Vercel, Node.js/Docker, Bun, Railway. Selective SSR (ssr option per route), SPA mode, static prerendering, ISR with Cache-Control headers, SEO and head management."
  - id: "@tanstack/start-client-core#start-core/execution-model"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/execution-model"
    for: "Isomorphic-by-default principle, environment boundary functions (createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn), ClientOnly component, useHydrated hook, import protection, dead code elimination, environment variable safety (VITE_ prefix, process.env)."
  - id: "@tanstack/start-client-core#start-core/middleware"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/middleware"
    for: "createMiddleware, request middleware (.server only), server function middleware (.client + .server), context passing via next({ context }), sendContext for client-server transfer, global middleware via createStart in src/start.ts, middleware factories, method order enforcement, fetch override precedence."
  - id: "@tanstack/start-client-core#start-core/server-functions"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/server-functions"
    for: "createServerFn (GET/POST), validator (Zod or function), useServerFn hook, server context utilities (getRequest, getRequestHeader, setResponseHeader, setResponseStatus), error handling (throw errors, redirect, notFound), streaming, FormData handling, file organization (.functions.ts, .server.ts)."
  - id: "@tanstack/start-client-core#start-core/server-routes"
    run: "npx @tanstack/intent@latest load @tanstack/start-client-core#start-core/server-routes"
    for: "Server-side API endpoints using the server property on createFileRoute, HTTP method handlers (GET, POST, PUT, DELETE), createHandlers for per-handler middleware, handler context (request, params, context), request body parsing, response helpers, file naming for API routes."
  - id: "@tanstack/start-server-core#start-server-core"
    run: "npx @tanstack/intent@latest load @tanstack/start-server-core#start-server-core"
    for: "Server-side runtime for TanStack Start: createStartHandler, request/response utilities (getRequest, setResponseHeader, setCookie, getCookie, useSession), three-phase request handling, AsyncLocalStorage context."
  - id: "@tanstack/virtual-file-routes#virtual-file-routes"
    run: "npx @tanstack/intent@latest load @tanstack/virtual-file-routes#virtual-file-routes"
    for: "Programmatic route tree building as an alternative to filesystem conventions: rootRoute, index, route, layout, physical, defineVirtualSubtreeConfig. Use with TanStack Router plugin's virtualRouteConfig option."
<!-- intent-skills:end -->
