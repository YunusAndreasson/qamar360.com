-- Housekeeping from the Supabase security and performance advisors (2026-11-15). No access
-- changes for a signed-in user: every policy dropped here has an identical twin that stays.
--
-- 1. Duplicate RLS policies. The same rule exists twice under two names on habits,
--    habit_completions and users (left over from two rounds of setup), and daily_notes has each
--    rule once with `auth.uid()` and once with the faster `(select auth.uid())`. Postgres
--    evaluates every permissive policy on every row, so each twin is pure cost. The faster form
--    is kept where both exist.
-- 2. `get_global_completion_percentage` is a SECURITY DEFINER function from the first prototype
--    that anyone could call without signing in, and it counted every user's completions. Nothing in
--    the app, the website or the Edge Functions calls it, so it is dropped.
-- 3. `handle_new_user` runs only as the `on_auth_user_created` trigger. A trigger does not need
--    EXECUTE, so the API roles lose the ability to call it as an RPC.
-- 4. `update_updated_at_column` gets a fixed search_path (advisor lint 0011).
--
-- Order: independent of the two pending migrations (20260719170000 cascade, 20260725210000
-- reminder_time). Do NOT `supabase db push` while 20260725210000 is held back, because push applies
-- every pending file. Apply this file on its own, then mark it applied with
-- `supabase migration repair --status applied 20261115120000`.

begin;

-- 1. Duplicate policies: drop one of each identical pair.
drop policy if exists "Users can delete their own habits" on public.habits;
drop policy if exists "Users can create their own habits" on public.habits;
drop policy if exists "Users can view their own habits" on public.habits;
drop policy if exists "Users can update their own habits" on public.habits;

drop policy if exists "Users can delete their own completions" on public.habit_completions;
drop policy if exists "Users can create their own completions" on public.habit_completions;
drop policy if exists "Users can view their own completions" on public.habit_completions;

drop policy if exists "Users can view their own data" on public.users;

drop policy if exists "Users can read own notes" on public.daily_notes;
drop policy if exists "Users can create own notes" on public.daily_notes;
drop policy if exists "Users can update own notes" on public.daily_notes;
drop policy if exists "Users can delete own notes" on public.daily_notes;

-- 2. The unused, publicly callable aggregate.
drop function if exists public.get_global_completion_percentage(date, date);

-- 3. Trigger-only function: not an RPC.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 4. Pin the search_path.
alter function public.update_updated_at_column() set search_path = public;

commit;
