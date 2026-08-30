-- Daily reflections and one persisted AI-assisted insight per closed lunar quarter.
-- Notes remain private user data. The Worker can only include them after explicit consent;
-- withdrawing that consent purges every generated insight that used note content.

alter table public.habits
  add column preset_id text references public.presets (id) on delete set null;

-- Preserve the evidence link for existing catalog-created habits where the name still matches.
update public.habits as habit
set preset_id = preset.id
from public.presets as preset
where habit.preset_id is null
  and lower(trim(habit.name)) = lower(trim(preset.name));

create index habits_user_preset_idx on public.habits (user_id, preset_id);

alter table public.users
  add column ai_notes_consent_at timestamptz,
  add column ai_notes_consent_version smallint,
  add constraint users_ai_notes_consent_check check (
    (ai_notes_consent_at is null and ai_notes_consent_version is null)
    or (ai_notes_consent_at is not null and ai_notes_consent_version = 1)
  );

-- Production already has this shape from its original private-journal rollout. Reuse it when
-- present so existing reflections (including optional voice metadata) remain intact.
create table if not exists public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  note_date date not null,
  body text not null default '',
  spoken_seconds integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, note_date)
);

alter table public.daily_notes
  add constraint daily_notes_body_length_check
  check (char_length(trim(body)) between 1 and 4000);

alter table public.daily_notes enable row level security;
alter table public.daily_notes force row level security;

create policy "Users can read own daily notes" on public.daily_notes
  for select using ((select auth.uid()) = user_id);
create policy "Users can create own daily notes" on public.daily_notes
  for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own daily notes" on public.daily_notes
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own daily notes" on public.daily_notes
  for delete using ((select auth.uid()) = user_id);

create table public.generated_insights (
  user_id uuid not null references public.users (id) on delete cascade,
  reading_id text not null check (reading_id ~ '^[0-9]+-(1[0-2]|[1-9])-(1|8|15|22)$'),
  paragraphs text[] not null check (cardinality(paragraphs) = 3),
  next_step text not null check (char_length(trim(next_step)) between 1 and 320),
  evidence_preset_id text references public.presets (id) on delete set null,
  evidence_text text,
  used_notes boolean not null default false,
  model text not null,
  prompt_version smallint not null,
  generated_at timestamptz not null default now(),
  primary key (user_id, reading_id)
);

alter table public.generated_insights enable row level security;
alter table public.generated_insights force row level security;

-- The app may read its own result. Inserts remain Worker-only through the server secret.
create policy "Users can read own generated insights" on public.generated_insights
  for select using ((select auth.uid()) = user_id);

-- Serialize note-derived inserts with consent changes by locking the same users row that an
-- update must lock. If withdrawal wins, the insert is refused; if insertion wins, the waiting
-- withdrawal trigger purges it before that withdrawal commits.
create or replace function public.enforce_note_insight_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.used_notes then
    perform 1
    from public.users
    where id = new.user_id
      and ai_notes_consent_at is not null
      and ai_notes_consent_version = 1
    for update;

    if not found then
      return null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_note_insight_consent() from public;

create trigger enforce_note_insight_consent_before_insert
before insert on public.generated_insights
for each row execute function public.enforce_note_insight_consent();

create or replace function public.purge_note_insights_on_consent_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ai_notes_consent_at is not null and new.ai_notes_consent_at is null then
    delete from public.generated_insights
    where user_id = new.id and used_notes = true;
  end if;
  return new;
end;
$$;

revoke all on function public.purge_note_insights_on_consent_withdrawal() from public;

create trigger purge_note_insights_after_consent_withdrawal
after update of ai_notes_consent_at on public.users
for each row execute function public.purge_note_insights_on_consent_withdrawal();

grant select, insert, update, delete on public.daily_notes to authenticated;
revoke all on public.generated_insights from anon, authenticated;
grant select on public.generated_insights to authenticated;
grant select, insert on public.generated_insights to service_role;
