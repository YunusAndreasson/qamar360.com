-- Goals (with their acts and check-ins) and plans are taken out of the app (2026-10-17): the app
-- measures one thing, the acts kept under the moon, and these two were the parts that counted in
-- something else. A count target on an act carries what a goal's daily ask did.
--
-- APPLY ONLY AFTER every installed client has the update that stopped using them. Until then an
-- older client still reads these tables, and still sends `plan_id` when it writes a to-do — an
-- insert naming a dropped column fails, so dropping it early would break adding to-dos there.
-- The website must be deployed without its plans pages first, for the same reason.
--
-- `set_updated_at()` was written for plans and is used by nothing else once these tables go.

begin;

alter table public.tasks drop column if exists plan_id;

-- Each takes its own policies, indexes and triggers with it. Children first.
drop table if exists public.goal_check_ins;
drop table if exists public.goal_acts;
drop table if exists public.goals;
drop table if exists public.plans;

drop function if exists public.set_updated_at();

commit;
