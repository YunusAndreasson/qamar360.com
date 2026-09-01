-- The index `goal_acts` actually needed.
--
-- 20260901120000 gave the table its primary key `(goal_id, habit_id)` and an index on `habit_id`,
-- and a comment claiming they served "this user's goals in order, and one goal's acts". Neither
-- claim survives contact with the client: nothing selects `goal_acts` by `goal_id`, and both
-- reads that exist — `fetchGoals` and `loadGoalReadings` in `src/hooks/use-goals.tsx` — ask for
-- every engine row this user owns:
--
--   select * from public.goal_acts where user_id = ?
--
-- With no index leading on `user_id` that is a sequential scan of every user's rows, filtered by
-- RLS afterwards. It is small today and would not stay small.
--
-- `habit_id` keeps its own index: that one is real, and it is the lookup the act sheet makes when
-- it asks which goal an act on the day belongs to.
create index if not exists goal_acts_user_idx on public.goal_acts (user_id);

comment on index public.goal_acts_user_idx is
  'The only read the client makes of this table: every engine row for one user.';
