# Security policy

Qamar360 keeps each user's account in Supabase, with the habits, stacks,
exchanges and to-dos they record, the days they kept them, and a profile photo
if they add one. A hole here could expose one person's record to another, or
let someone change or delete it. Please report one privately.

## Reporting a vulnerability

Use GitHub's private reporting:
[report a vulnerability](https://github.com/YunusAndreasson/qamar360.com/security/advisories/new).
Please don't open a public issue.

Include what you did, what happened, and what an attacker would gain. For the
app, say which build (Settings shows the version) and which phone; for the
site, the URL and the browser. Don't test against accounts that aren't yours.
A fix is coordinated with you before anything is published, and you're
credited in the advisory unless you'd rather not be.

## Supported versions

Only the latest build of the app and the site as deployed at
https://qamar360.com get fixes. The app ships fixes as a new build or an
over-the-air update; the site, as a new deploy.

## Scope

In scope:

- the app's code in `src/`, and how it uses Supabase auth, storage and the
  database
- the row-level security policies and functions in `supabase/migrations/`, and
  the `delete-account` Edge Function in `supabase/functions/`
- https://qamar360.com and the Cloudflare Worker behind it (`web/`)
- this repository's workflows

Out of scope: vulnerabilities in Supabase, Expo, Cloudflare, or Sign in with
Apple and Google themselves. Report those to their projects.
