-- Reflections are generated on the device now, so the cloud path is taken out whole: the stored
-- insights, the consent that let the Worker read notes, and the two functions that tied them
-- together. `daily_notes.spoken_seconds` goes with it; dictation was removed and nothing writes it.
-- `habits.preset_id` from the same original migration stays: the on-device prompt reads it.

begin;

drop trigger if exists purge_note_insights_after_consent_withdrawal on public.users;
drop function if exists public.purge_note_insights_on_consent_withdrawal();

-- Takes its own insert trigger and policies with it.
drop table if exists public.generated_insights;
drop function if exists public.enforce_note_insight_consent();

alter table public.users
  drop constraint if exists users_ai_notes_consent_check,
  drop column if exists ai_notes_consent_at,
  drop column if exists ai_notes_consent_version;

alter table public.daily_notes
  drop column if exists spoken_seconds;

commit;
