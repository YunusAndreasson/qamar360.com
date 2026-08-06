-- One-off tasks — the third thing a day contains.
--
-- A stack is a sequence you keep; an exchange is a deed put where an old routine keeps happening.
-- Both repeat, and both are recorded in `habit_completions` so degrees, the month ring, the year
-- trend, streaks and Insights all read them. A task is none of that: it happens once and is done.
--
-- It gets its OWN table rather than another `habits` row, and the reason is the progress math.
-- `computeProgress` re-walks every habit's schedule across past days to derive a month's rate, so
-- a row with no recurring schedule — one that stops existing the moment it is finished — would
-- silently rewrite the rates of months already closed. Tasks therefore touch none of that math.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  -- Cascading, so deleting the auth user still removes every trace in one transaction
  -- (see 20260719170000_cascade_user_deletion.sql — the Edge Function performs one deletion).
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  -- The day it was captured for. There is no future here: the day-stepper reaches backwards only,
  -- so this is always the viewed day at creation.
  due_on date not null,
  -- The local day it was ticked; null means still open. A DATE rather than a boolean so a
  -- backfilled past day can show what was done on THAT day — the same shape
  -- `habit_completions.completed_at` gives a habit.
  done_on date,
  -- Insertion order within a day. Manual reordering isn't offered yet; this is what keeps the
  -- list stable when two tasks are written in the same second.
  position integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on column public.tasks.done_on is
  'The local day this was ticked; null means open. A date, so a past day shows what was done then.';
comment on column public.tasks.due_on is
  'The day it was captured for. An open task also carries forward onto today until it is done.';

-- The one query the app makes: this user's tasks around a day.
create index tasks_user_due_idx on public.tasks (user_id, due_on);

-- Row-level security, mirroring `habits` exactly.
alter table public.tasks enable row level security;

create policy "Users can read own tasks" on public.tasks
  for select using (auth.uid() = user_id);
create policy "Users can create own tasks" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "Users can update own tasks" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own tasks" on public.tasks
  for delete using (auth.uid() = user_id);
