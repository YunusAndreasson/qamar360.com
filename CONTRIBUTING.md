# Contributing

Bug reports and pull requests are welcome. For anything bigger than a fix,
open an issue first, so we can agree on the shape before you write the code.

## Build and check

You need Node 26 for the app and pnpm for the site. Before a pull request:

- `npm ci && npm run verify` passes: `tsc`, ESLint with no warnings allowed,
  knip, the deprecated-API scan and Jest. The tests mock Supabase, so no
  account or `.env` is needed.
- For a change to the site, `cd web && pnpm install --frozen-lockfile &&
  pnpm verify` passes too. [web/AGENTS.md](web/AGENTS.md) has its rules for
  layout, photographs and app screens, and
  [docs/website-plan.md](docs/website-plan.md) the copy rules.
- A change to what the app shows has been tried on a phone or an emulator.
  Say which in the pull request.
- One change per pull request, with a commit message in the repository's
  style: `fix(today): …`, `feat(web): …`, `copy(web): …`, `chore(deps): …`.

## What Qamar360 won't do

Some behaviour is deliberate and changes to it need a strong case:

- No reminder for any single habit. The prayer is the cue, and the only
  notifications are the four lunar updates a month.
- It never asks for your location. The sky comes from the phone's time zone.
- No ads, analytics or tracking SDKs.
- An act in the catalog cites its source, and copy never claims more than the
  source says.
- Dieter Rams decides what is on a screen and Don Norman how it's found and
  used (see [AGENTS.md](AGENTS.md)). A new control has to earn its place.

## Security issues

Not in issues or pull requests: see [SECURITY.md](SECURITY.md).

## Conduct and license

Everyone here follows the [Code of Conduct](CODE_OF_CONDUCT.md). By
contributing, you agree your code is released under the
[MIT license](LICENSE).
