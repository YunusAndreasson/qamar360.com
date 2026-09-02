-- Check-ins — a goal asking where you are.
--
-- 20260901120000 built goals on a single claim: a goal owns no measurements. Every figure is
-- derived from `habit_completions`, the rows the daily tick already writes, because Harkin et al.
-- (2016) found the effect of progress monitoring runs THROUGH how often you monitor, and a goal
-- with a logging screen of its own would be visited monthly.
--
-- That claim held for a measure some act produces. It cannot hold for one no act produces. A
-- weight is not memorised four lines at a time; there is nothing to tick, and `computeGoals` is
-- monotonically increasing by construction — `remaining = max(0, target - earned)` over a sum of
-- non-negative credits — so "85 kg down to 75" was not merely unbuilt, it was inexpressible. The
-- Insights copy has been offering "ḥifẓ, a language, a weight" with nothing behind the last word.
--
-- So this adds logging, and the reason it does not forfeit the finding above is that the finding
-- is about FREQUENCY, and a check-in raises it:
--
--   * It does not replace the daily tick. An act-driven goal keeps its acts, and a reading only
--     re-bases them — credit earned after the reading's day still adds on top of it. Reporting
--     "I am on page 340" repairs the drift `contributedCredit`'s `?? target_count` fallback
--     already admits to; it does not stand in for the act.
--   * It is not a screen you must remember to visit. It is a row on Today, in the same
--     CompletionRing column as everything else the day asks for, and — like an open to-do — it
--     holds the day's close back until it is answered. Monitoring becomes something the day
--     brings to you, which is the only version of it that survives a bad week.
--   * The quota stays fixed at the month's start (`src/lib/goals.ts`). A reading moves `earned`;
--     it must never move the month's ask, or a subgoal stops being attainable and attainment is
--     the entire mechanism.
--
-- A check-in earns no degrees, for the reason tasks do not: `computeProgress` re-walks each
-- habit's schedule across past days, and anything new inside that sweep silently rewrites the
-- rates of months that have already closed.
create table public.goal_check_ins (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals (id) on delete cascade,
  -- Cascading from the user too, so one deletion still removes every trace in one transaction
  -- (20260719170000_cascade_user_deletion.sql). Carried rather than reached through `goals`, so
  -- the four policies below are the same one-liners every other table has.
  user_id uuid not null references public.users (id) on delete cascade,
  -- The local day the reading is FOR, not when it was typed — same rule as `habit_completions`
  -- and `tasks.done_on`. A date, so the day is the identity.
  taken_on date not null,
  -- Numeric and unconstrained in sign: this is a position, not a gain. A goal counted in pages
  -- may legitimately read 0, and one counted in kilograms never reaches it.
  value numeric not null,
  -- Optional, and short. What the number does not say: "travelling", "after Ramaḍān". It is read
  -- back on the goal's own screen beside the reading and nowhere else.
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  -- One reading per goal per day. A second answer on the same day is a correction of the first,
  -- not a second data point — which is also what lets the client upsert without reading first.
  unique (goal_id, taken_on)
);

comment on column public.goal_check_ins.value is
  'Where the goal stands on `taken_on`, in the goal''s own unit. A position, not an increment.';

-- The one read the client makes: every reading this user owns, oldest first. Unwindowed on
-- purpose — a goal''s measure is a lifetime series, and the first reading is its baseline.
create index goal_check_ins_user_goal_idx on public.goal_check_ins (user_id, goal_id, taken_on);

alter table public.goal_check_ins enable row level security;
alter table public.goal_check_ins force row level security;

create policy "Users can read own goal check-ins" on public.goal_check_ins
  for select using ((select auth.uid()) = user_id);
create policy "Users can create own goal check-ins" on public.goal_check_ins
  for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own goal check-ins" on public.goal_check_ins
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own goal check-ins" on public.goal_check_ins
  for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.goal_check_ins to authenticated;

-- Load-bearing here in a way it is not on `goals`: a reading is edited in place (the unique
-- constraint above guarantees it), so the stamp is how the goal screen orders two corrections
-- made to the same day.
create trigger goal_check_ins_set_updated_at
before update on public.goal_check_ins
for each row execute function public.set_updated_at();

-- The cadence, on the goal itself: it is one-to-one with the goal, and these are exactly the two
-- shapes `scheduledOn` already reads, so the check-in inherits the whole recurrence engine
-- (weekdays, Hijri month days) rather than inventing a second one. Daily is [0..6]; weekly is one
-- weekday; each moon quarter is `{"monthDays":[1,8,15,22]}` — the same grid the quarterly
-- readings publish on; each Hijri month is `{"monthDays":[1]}`.
alter table public.goals
  add column check_in_days integer[] not null default '{}',
  add column check_in_hijri jsonb,
  -- The day the cadence was set. Without it a weekly check-in added today would look overdue
  -- since the goal was created, and the day view reaches thirty days back.
  add column check_in_from date,
  -- Which way the measure travels. Stored rather than derived from the first reading against the
  -- target: derived, a weight goal would read as "reached" the first time it dipped under target
  -- and then stay wrong when it rose again. The composer settles it once, from the starting
  -- value, and never asks.
  add column direction text not null default 'up' check (direction in ('up', 'down'));

comment on column public.goals.check_in_from is
  'The day the cadence was set. A check-in never fires on a day before it.';

-- A cadence is all or nothing: a schedule with no start day would fire into the past, and a start
-- day with no schedule would never fire at all.
alter table public.goals add constraint goals_check_in_cadence check (
  (check_in_from is null and cardinality(check_in_days) = 0 and check_in_hijri is null)
  or (check_in_from is not null and (cardinality(check_in_days) > 0 or check_in_hijri is not null))
);

-- Nothing else can measure a falling number. An act adds; it does not subtract, so a goal that
-- travels downward has no engine and must be reported.
alter table public.goals add constraint goals_down_needs_check_in check (
  direction = 'up' or check_in_from is not null
);
