-- Count-based goal habits.
--
-- A habit may now carry a numeric daily target instead of being a single binary
-- done/not-done act. When `target_count` is non-null the habit is a "count goal"
-- (e.g. read 5 pages, drink 8 cups); `target_unit` is an optional label shown next
-- to the count ("pages", "cups"). A null `target_count` keeps the habit binary —
-- existing rows and the toggle path behave exactly as before.
--
-- Progress for a count goal is logged on the same single `habit_completions` row
-- (the table has UNIQUE (habit_id, completed_at)) via the new integer `count`:
--   status 'done'    -> count reached the target (counts fully toward the rate)
--   status 'partial' -> 0 < count < target (progress persisted; contributes count/target)
--   status 'skipped' -> excused (unchanged)
--   (no row)         -> open / nothing logged (unchanged)
-- Binary habits never set `count`. Additive + nullable, so existing rows are
-- unaffected. RLS is row-level on user_id and already covers the new columns.

alter table public.habits
  add column if not exists target_count integer,
  add column if not exists target_unit text;

alter table public.habit_completions
  add column if not exists count integer;

-- Widen the status check to admit the new 'partial' state (drop + re-add, mirroring
-- the original constraint creation). 'partial' rows are count goals still in progress.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'habit_completions_status_check'
  ) then
    alter table public.habit_completions
      drop constraint habit_completions_status_check;
  end if;
  alter table public.habit_completions
    add constraint habit_completions_status_check check (status in ('done', 'skipped', 'partial'));
end $$;
