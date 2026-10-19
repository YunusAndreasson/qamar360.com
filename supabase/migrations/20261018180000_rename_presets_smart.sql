-- A catalog name should say what counts as done, so a tick can be checked yes or no. Where a
-- preset's detail already fixed a number ("at least 20 focused minutes") the name now carries it;
-- where the name repeated its own count unit ("… after each prayer · 5 prayers") it no longer does;
-- and two spellings follow the house transliteration (Ḍuḥā, ṣalawāt). The catalog moved in
-- src/constants/sunnah-habits.ts and src/constants/exchanges.ts; this brings the habits users
-- already created along with it, so Discover and the exchange library still match them as added.
--
-- A row is renamed only when it was made from that preset (`preset_id`) AND still carries the
-- preset's old name, exactly or with a numeric "Add another" suffix ("… 2", carried over as in
-- 20260725220000_rename_habits_past_tense.sql). A habit someone typed themselves ("Went for a
-- walk") keeps its name, and so does a preset habit its owner has since renamed. The one exchange
-- carries no preset id, so it is matched as a library exchange: no preset, an `instead_of`.
--
-- A row is skipped when the habits beside it (the same stack, or the loose habits) already hold
-- the new name under the app's folding (`normalizeName` in src/lib/names.ts: trimmed, lower-cased,
-- diacritics and ʿayn/hamza stripped), since names are unique only within a container and the app
-- would read the pair as duplicates. Re-running is a no-op: the old names no longer exist.
begin;

-- The app's `normalizeName`, for the collision check. Session-scoped: gone when the session ends.
create function pg_temp.fold_name(name text) returns text language sql immutable as $$
  select regexp_replace(
    regexp_replace(normalize(lower(trim(name)), NFD), '[\u0300-\u036f]', '', 'g'),
    '[ʾʿ‘’]', '', 'g')
$$;

with renames(preset_id, old_name, new_name) as (values
  ('duha', 'Prayed Duhā (2 rakʿah)', 'Prayed two rakʿah of Ḍuḥā'),
  ('salawat', 'Sent salawāt ×10 on the Prophet ﷺ', 'Sent ṣalawāt ×10 on the Prophet ﷺ'),
  ('tasbih-after-salah', 'Said tasbīḥ ×33 after each prayer', 'Said tasbīḥ after prayer'),
  ('ayat-al-kursi', 'Recited Āyat al-Kursī after each prayer', 'Recited Āyat al-Kursī after prayer'),
  ('focused-study', 'Studied with focus', 'Studied for 30 focused minutes'),
  ('arabic-study', 'Studied Arabic', 'Studied Arabic for 20 minutes'),
  ('daily-walk', 'Went for a walk', 'Took a brisk 10-minute walk'),
  ('exercise-daily', 'Moved my body', 'Exercised for 20 minutes'),
  ('qaylulah', 'Took a short midday rest', 'Rested 10 minutes at midday'),
  ('morning-daylight', 'Got morning daylight', 'Got 5 minutes of morning daylight'),
  ('screens-away', 'Put screens away before sleep', 'Put screens away 30 minutes before sleep'),
  ('caffeine-cutoff', 'Cut caffeine after early afternoon', 'Had my last caffeine by 2pm'),
  ('sleep-7-hours', 'Gave sleep at least 7 hours', 'Went to bed 7 hours before waking'),
  ('fast-ashura', 'Fasted ʿĀshūrāʾ', 'Fasted Tāsūʿāʾ & ʿĀshūrāʾ'),
  ('kaffarat-al-majlis', 'Sealed a gathering', 'Said the duʿāʾ on leaving a gathering'),
  -- The exchange from the library (src/constants/exchanges.ts `dua-not-scrolling`): no preset id.
  (null, 'Made duʿāʾ', 'Made duʿāʾ while waiting')
),
targets as (
  select h.id, h.user_id, h.stack_id,
         r.new_name || substr(h.name, length(r.old_name) + 1) as new_name
  from public.habits h
  join renames r
    on (h.name = r.old_name
        or (left(h.name, length(r.old_name) + 1) = r.old_name || ' '
            and substr(h.name, length(r.old_name) + 2) ~ '^[0-9]+$'))
   and (case when r.preset_id is null
             then h.preset_id is null and h.instead_of is not null
             else h.preset_id = r.preset_id end)
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
      and pg_temp.fold_name(o.name) = pg_temp.fold_name(t.new_name)
  );

commit;
