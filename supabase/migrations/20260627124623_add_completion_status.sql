-- A "skip" state for a habit-day.
--
-- A scheduled act can now be legitimately skipped (traveling, a woman in her
-- period, etc.) without it counting as a miss. We encode the per-habit-day state
-- on the single `habit_completions` row (the table already has
-- `UNIQUE (habit_id, completed_at)`, so a habit-day is exactly one of these):
--   'done'    -> completed; counts toward the rate (today's behaviour)
--   'skipped' -> excused; excluded from BOTH numerator and denominator, like a rest day
--   (no row)  -> open / missed (unchanged)
--
-- Defaulting to 'done' leaves every existing row — and the existing insert/toggle
-- path — behaving exactly as before. Additive + reversible (drop column). RLS is
-- row-level on user_id and already covers the new column.
alter table public.habit_completions
  add column if not exists status text not null default 'done';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'habit_completions_status_check'
  ) then
    alter table public.habit_completions
      add constraint habit_completions_status_check check (status in ('done', 'skipped'));
  end if;
end $$;

-- The app now flips a row's status in place (done <-> skipped) via an upsert, which
-- Postgres runs as an UPDATE. The original policies only covered INSERT/DELETE/SELECT,
-- so add a row-owner UPDATE policy (mirrors the others) or that flip is blocked by RLS.
do $$
begin
  if not exists (
    select 1 from pg_policy
    where polrelid = 'public.habit_completions'::regclass
      and polname = 'Users can update own completions'
  ) then
    create policy "Users can update own completions"
      on public.habit_completions
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
