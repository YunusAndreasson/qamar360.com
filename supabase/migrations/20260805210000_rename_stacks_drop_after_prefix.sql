-- Stack names drop their "After " prefix (2026-08-05).
--
-- Nine of the thirteen default names opened on the same word, so a folded day was a column of
-- cards whose first word carried no information and whose distinguishing word sat at a different x
-- on every row. The client's defaults (`lib/moments.ts` stackName, `constants/curated-stacks.ts`)
-- changed in the same commit; this brings along the rows already created from the old ones, the
-- same way 20260725220000 brought habit names along to past tense.
--
-- Only rows whose name is EXACTLY an old default are touched — a name the user typed or edited is
-- theirs and is left alone. And a rename is skipped when that user already has a stack under the
-- target name, so this can never mint two identically-named stacks in one account (the app treats
-- a folded name as a stack's identity when deduping).
--
-- Safe to re-run: after it lands, no row matches an old default any more.

with renames(old_name, new_name) as (
  values
    ('After waking, for the body', 'Waking up, for the body'),
    ('After waking', 'Waking up'),
    ('After rising at night', 'Rising at night'),
    ('After getting into bed', 'Getting into bed'),
    ('After Fajr', 'Fajr'),
    ('After Dhuhr', 'Dhuhr'),
    ('After ʿAṣr', 'ʿAṣr'),
    ('After Maghrib', 'Maghrib'),
    ('After ʿIshāʾ', 'ʿIshāʾ'),
    ('After Jumuʿah', 'Jumuʿah')
)
update habit_stacks as s
set name = r.new_name
from renames as r
where s.name = r.old_name
  and not exists (
    select 1
    from habit_stacks as other
    where other.user_id = s.user_id
      and other.id <> s.id
      and lower(btrim(other.name)) = lower(btrim(r.new_name))
  );
