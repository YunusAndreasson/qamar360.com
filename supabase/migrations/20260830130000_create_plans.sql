-- Plans — the things you mean to do, before they have a day.
--
-- A stack is a sequence you keep; an exchange is a deed put where an old routine keeps happening;
-- a task is a one-off, captured for a day. All three are anchored in time. A plan is not: "take
-- the family to Denmark" has no date, and what makes it worth keeping is the paragraph behind the
-- title — where you'd go, what it would cost, what the children asked for.
--
-- It gets its own table rather than a nullable `tasks.due_on`, and the reason is the same one that
-- kept tasks out of `habits`: `due_on` is NOT NULL and every visibility rule, query and day-close
-- count is written against that (`src/lib/tasks.ts`). Teaching all of them a null case, so that a
-- task could also grow a body it is documented as not having, is a larger change than a second
-- table — and it would blur the one distinction the UI is built on. A task is a line you type; a
-- plan is something you write.
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  -- Cascading, so deleting the auth user still removes every trace in one transaction
  -- (see 20260719170000_cascade_user_deletion.sql — the Edge Function performs one deletion).
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  -- The notes behind the title. Empty is legitimate — a plan may start as a name and grow later —
  -- so this is `default ''` with a ceiling rather than `not null` with a floor. 4000 is the same
  -- ceiling `daily_notes` uses, so there is one limit for long-form text in this product.
  body text not null default '' check (char_length(body) <= 4000),
  -- Insertion order. Manual reordering isn't offered yet; this is what keeps the list stable when
  -- two plans are written in the same second, exactly as on `tasks`.
  position integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on column public.plans.body is
  'The notes behind the title. May be empty; capped at 4000 characters, as daily_notes is.';

-- The one query the app makes: this user's plans, in order.
create index plans_user_position_idx on public.plans (user_id, position);

-- Row-level security, in the shape the daily_notes migration established: `(select auth.uid())`
-- so the planner caches it, and `force` so even a table owner is subject to it.
alter table public.plans enable row level security;
alter table public.plans force row level security;

create policy "Users can read own plans" on public.plans
  for select using ((select auth.uid()) = user_id);
create policy "Users can create own plans" on public.plans
  for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own plans" on public.plans
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own plans" on public.plans
  for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.plans to authenticated;

-- `updated_at` is the web editor's concurrency token: it narrows an autosave to the row exactly as
-- it was last read, so a save from the phone in between is refused rather than silently overwritten
-- (web/src/lib/notes.ts). That only works if the column moves on EVERY write, and there are two
-- independent clients here — so the guarantee belongs in the database rather than in a rule each
-- client has to remember. This is the repo's first such trigger; plans are also its first row
-- edited from both surfaces.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

-- The link from a to-do back to the plan it came from.
--
-- Nullable, because most to-dos are still typed straight into the day and belong to nothing. And
-- `set null` rather than `cascade`: deleting a plan must not reach into a day you have already
-- committed to and take the to-do off it. Once it is on a list it is yours, not the plan's.
alter table public.tasks
  add column plan_id uuid references public.plans (id) on delete set null;

comment on column public.tasks.plan_id is
  'The plan this was pulled from, if any. Null for a to-do typed straight into the day.';

-- Partial, because the overwhelming majority of rows have no plan: this index answers "what has
-- this plan already put on a list?" without carrying every task that never came from one.
create index tasks_plan_idx on public.tasks (plan_id) where plan_id is not null;
