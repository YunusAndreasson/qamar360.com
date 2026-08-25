-- Ḍuḥā, the moment the table never learned.
--
-- `habit_stacks.moment` is checked against a written-out list of the moments the client offers,
-- and the client grew a fourteenth (`duha`, shipped with the curated Ḍuḥā stack) without this
-- list growing with it. The failure that caused is worth spelling out, because it looked like
-- nothing: the library's "Anchor these" inserts the habits first and the stack second, so the
-- acts landed, the stack's INSERT was rejected 23514, and the rollback left the acts behind as
-- loose rows while the card went back to reading "Already yours" — no way to retry from the UI,
-- and no stack on Today.
--
-- The list stays enumerated rather than becoming a free-text column: it is the one place the
-- database can catch a client writing a moment nothing downstream knows how to render. What it
-- can't catch is itself falling behind, so `lib/__tests__/moments.test.ts` now reads this file
-- and fails if it and MOMENT_DEFS ever disagree again.
alter table public.habit_stacks
  drop constraint if exists habit_stacks_moment_check;

alter table public.habit_stacks
  add constraint habit_stacks_moment_check check (
    moment in (
      'morning', 'midday', 'evening', 'night',
      'waking-up', 'before-dawn', 'bedtime',
      -- Prayers, in the order of the day. `duha` sits between Fajr and Dhuhr, where it falls.
      'fajr', 'duha', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah'
    )
  );
