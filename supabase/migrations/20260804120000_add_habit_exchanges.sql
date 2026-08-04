-- An *exchange*: a habit that exists to take the place of an old routine, rather than to be
-- added to the day. The evidence is consistent that a plan phrased as a negation ("if X, then
-- I will NOT do Y") strengthens the very habit it names, while a replacement plan ("if X, then
-- I will do Z instead") displaces it — so the app stores and tracks the good deed, and keeps
-- the displaced routine as context only.
--
-- Both columns live on `habits` on purpose: an exchange is ticked with an ordinary
-- `habit_completions` row, which is what lets degrees, the month ring, the year trend, streaks
-- and per-habit Insights work with no new math and no second completion table.
alter table public.habits
  -- The routine being displaced ("Soft drinks"). NOT NULL *is* the discriminator: a habit
  -- carrying this is an exchange, and one without it is an ordinary act.
  add column instead_of text,
  -- The situation that fires the urge ("When I sit down to eat") — the "if" half of the plan.
  -- An exchange with no cue is not an if-then plan at all, so the form requires it; the column
  -- stays nullable so a client that predates this migration can't be broken by it.
  add column cue text;

-- An exchange is anchored to an urge, not to a moment, so it deliberately holds no `stack_id`.
comment on column public.habits.instead_of is
  'The displaced routine. Non-null marks this habit as an exchange (stack_id stays null).';
comment on column public.habits.cue is
  'The situation that fires the urge — the "if" half of the replacement plan.';
