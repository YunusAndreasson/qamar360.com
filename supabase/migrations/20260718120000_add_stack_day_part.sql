-- A stack's optional day-part anchor: which chapter of the solar day it belongs to.
-- The Today screen rests a small sun glyph on the current chapter's stack. Nullable —
-- an unanchored stack is simply never visited by the sun.
alter table public.habit_stacks
  add column day_part text
  check (day_part in ('morning', 'midday', 'evening', 'night'));

-- One-time backfill: stacks the starter flow (or the user) already named after a day part.
update public.habit_stacks
  set day_part = lower(name)
  where day_part is null
    and lower(name) in ('morning', 'midday', 'evening', 'night');
