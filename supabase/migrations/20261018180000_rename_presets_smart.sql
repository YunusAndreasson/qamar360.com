-- A catalog name should say what counts as done, so a tick can be checked yes or no. Where a
-- preset's detail already fixed a number ("at least 20 focused minutes") the name now carries it;
-- where the name repeated its own count unit ("… after each prayer · 5 prayers") it no longer does;
-- and two spellings follow the house transliteration (Ḍuḥā, ṣalawāt). The catalog moved in
-- src/constants/sunnah-habits.ts and src/constants/exchanges.ts; this brings the habits users
-- already created along with it, so Discover and the exchange library still match them as added.
--
-- Matches the exact old name, or an old name with a numeric "Add another" suffix ("… 2"), and
-- carries that suffix over — the same rule as 20260725220000_rename_habits_past_tense.sql. A row is
-- skipped when the habits beside it (the same stack, or the loose habits) already hold the new
-- name, since names are unique only within a container. Re-running is a no-op: the old names no
-- longer exist.
begin;

with renames(old_name, new_name, exchange_only) as (values
  ('Prayed Duhā (2 rakʿah)', 'Prayed two rakʿah of Ḍuḥā', false),
  ('Sent salawāt ×10 on the Prophet ﷺ', 'Sent ṣalawāt ×10 on the Prophet ﷺ', false),
  ('Said tasbīḥ ×33 after each prayer', 'Said tasbīḥ after prayer', false),
  ('Recited Āyat al-Kursī after each prayer', 'Recited Āyat al-Kursī after prayer', false),
  ('Studied with focus', 'Studied for 30 focused minutes', false),
  ('Studied Arabic', 'Studied Arabic for 20 minutes', false),
  ('Went for a walk', 'Took a brisk 10-minute walk', false),
  ('Moved my body', 'Exercised for 20 minutes', false),
  ('Took a short midday rest', 'Rested 10 minutes at midday', false),
  ('Got morning daylight', 'Got 5 minutes of morning daylight', false),
  ('Put screens away before sleep', 'Put screens away 30 minutes before sleep', false),
  ('Cut caffeine after early afternoon', 'Had my last caffeine by 2pm', false),
  ('Gave sleep at least 7 hours', 'Went to bed 7 hours before waking', false),
  ('Fasted ʿĀshūrāʾ', 'Fasted Tāsūʿāʾ & ʿĀshūrāʾ', false),
  ('Sealed a gathering', 'Said the duʿāʾ on leaving a gathering', false),
  -- The exchange only: a stand-alone "Made duʿāʾ" someone named themselves is not this one.
  ('Made duʿāʾ', 'Made duʿāʾ while waiting', true)
),
targets as (
  select h.id, h.user_id, h.stack_id,
         r.new_name || substr(h.name, length(r.old_name) + 1) as new_name
  from public.habits h
  join renames r
    on (h.name = r.old_name
        or (left(h.name, length(r.old_name) + 1) = r.old_name || ' '
            and substr(h.name, length(r.old_name) + 2) ~ '^[0-9]+$'))
   and (not r.exchange_only or h.instead_of is not null)
)
update public.habits h
set name = t.new_name
from targets t
where h.id = t.id
  and not exists (
    select 1 from public.habits o
    where o.user_id = t.user_id
      and o.stack_id is not distinct from t.stack_id
      and o.id <> t.id
      and o.name = t.new_name
  );

commit;
