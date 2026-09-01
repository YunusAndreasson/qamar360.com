-- Goals — a horizon placed over acts you already keep.
--
-- The app has always counted one lunar month at a time. A goal is the first thing in it that
-- spans years: memorise the Qurʾān before you are 55, five thousand Arabic words, a language
-- learned. What it is NOT is a new thing to tick.
--
-- That is the whole design, and it is not a preference. Bandura & Schunk (1981) set children
-- the same self-directed course under proximal subgoals, distal goals, or none; the distal
-- condition had no demonstrable effect at all, while proximal subgoals produced mastery and,
-- with it, the belief that mastery was possible. Harkin et al. (2016), over 138 experiments,
-- found that monitoring progress promotes attainment — and that the effect runs THROUGH how
-- often you monitor. A goal with its own logging screen would be visited monthly and would
-- forfeit most of what makes goals work.
--
-- So a goal owns no measurements. It names a target, a by-when, and the acts that already
-- produce it, and every figure it shows — this month's share, the pace, the month it arrives —
-- is computed on read from `habit_completions`, the rows the daily tick already writes. That is
-- the same arrangement the quarterly readings use (`src/lib/insights.ts` has no table either),
-- and it means the feature adds exactly zero new gestures to a day.
--
-- A goal earns no degrees. Its engine acts are already scheduled habits and already inside
-- `computeProgress`, so crediting the goal as well would count one act twice and rewrite the
-- rate of months that have already closed. This is the same reasoning that kept one-off tasks
-- out of `habits` (20260806120000_create_tasks.sql), reached from the opposite direction: tasks
-- were excluded because they have no schedule, goals because their acts already have one.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  -- Cascading, so deleting the auth user still removes every trace in one transaction
  -- (see 20260719170000_cascade_user_deletion.sql — the Edge Function performs one deletion).
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  -- What is counted: 'lines', 'words', 'pages'. Free text rather than an enum, because the unit
  -- is only ever printed beside a number — nothing branches on it, and a CHECK here would be a
  -- schema change every time someone counts something new (the trap `habit_stacks.moment` set,
  -- where a new key is rejected 23514 until the constraint is widened by hand).
  unit text not null check (char_length(trim(unit)) between 1 and 24),
  -- Numeric, not integer: a goal may count pages and a day may be worth half of one.
  target_value numeric not null check (target_value > 0),
  -- The step between subgoals — one juzʾ, five hundred words. Null means the goal has none, and
  -- the screen then shows only the total. This column is the proximal half of the finding above:
  -- it is what turns 9,060 lines into a mark you can actually reach this season.
  milestone_step numeric check (milestone_step > 0),
  -- Stored Gregorian because Postgres has one calendar, but never SHOWN as one: every screen
  -- names it as a Hijri month and year, and the composer offers lunar spans rather than a date
  -- wheel. "Before I am 55" is two hundred and forty-odd lunar months in this app.
  horizon_on date not null,
  -- Mental contrasting, in two fields. Naming the obstacle and pre-deciding the response is the
  -- intervention with the largest effect in this literature, and it costs one screen of typing
  -- once. `if_then` is shown back to the user at the moment it is for — when they reach to skip
  -- one of the goal's acts — and nowhere else, so it stays a plan rather than a slogan.
  obstacle text not null default '' check (char_length(obstacle) <= 500),
  if_then text not null default '' check (char_length(if_then) <= 500),
  -- 'released' rather than 'abandoned': a goal you have put down is not a failure, and the word
  -- the schema uses is the word that leaks into copy. Reached goals are kept, not deleted — the
  -- record of having finished one is the most useful thing a goals list can hold.
  status text not null default 'open' check (status in ('open', 'reached', 'released')),
  position integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on column public.goals.horizon_on is
  'The by-when, stored Gregorian and always displayed as a Hijri month and year.';
comment on column public.goals.if_then is
  'The pre-decided response to the obstacle. Shown when an engine act is about to be skipped.';

-- The engine: which acts produce this goal, and which of them move the number.
--
-- `contributes` is the load-bearing column, and ḥifẓ is why it exists. The traditional cycle is
-- three acts — sabaq (the new lines), sabqī (the last week re-read), manzil (an older portion) —
-- and only the first adds anything to what is memorised. The other two are the reason the first
-- one survives, and a schema that could not tell them apart would either drop the revision from
-- the plan or count it as progress. Both are wrong, and the second is worse: it would report a
-- ḥāfiẓ finishing years early while what he had memorised quietly drained away.
create table public.goal_acts (
  goal_id uuid not null references public.goals (id) on delete cascade,
  -- Cascading from the habit too: an act that no longer exists cannot be part of an engine. The
  -- goal survives losing one, and its screen says it has nothing driving it rather than showing
  -- a zero, which would read as "you have done none of this" instead of "nothing is counting".
  habit_id uuid not null references public.habits (id) on delete cascade,
  -- Carried so the four policies below are the same one-liners every other table has, rather
  -- than an `exists` subquery re-planned on every row.
  user_id uuid not null references public.users (id) on delete cascade,
  contributes boolean not null default true,
  primary key (goal_id, habit_id)
);

comment on column public.goal_acts.contributes is
  'Whether this act moves the measure. False for revision — the acts that keep a goal from draining.';

-- The one query each table answers: this user's goals in order, and one goal's acts.
create index goals_user_position_idx on public.goals (user_id, position);
create index goal_acts_habit_idx on public.goal_acts (habit_id);

-- Row-level security, in the shape the plans migration established: `(select auth.uid())` so the
-- planner caches it, and `force` so even a table owner is subject to it.
alter table public.goals enable row level security;
alter table public.goals force row level security;
alter table public.goal_acts enable row level security;
alter table public.goal_acts force row level security;

create policy "Users can read own goals" on public.goals
  for select using ((select auth.uid()) = user_id);
create policy "Users can create own goals" on public.goals
  for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own goals" on public.goals
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own goals" on public.goals
  for delete using ((select auth.uid()) = user_id);

create policy "Users can read own goal acts" on public.goal_acts
  for select using ((select auth.uid()) = user_id);
create policy "Users can create own goal acts" on public.goal_acts
  for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own goal acts" on public.goal_acts
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own goal acts" on public.goal_acts
  for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, update, delete on public.goal_acts to authenticated;

-- `set_updated_at()` already exists (20260830130000_create_plans.sql). A goal is edited from one
-- surface today, so this is not yet the concurrency token it is for plans — it is here because a
-- horizon that moved is worth knowing the date of, and because adding the trigger later would
-- leave every row written before it with a stamp that never moved.
create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_updated_at();
