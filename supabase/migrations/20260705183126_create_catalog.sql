-- Shared catalog / reference content for the Sunnah library.
--
-- Until now this lived only as hardcoded TypeScript constants in the mobile app
-- (src/constants/sunnah-habits.ts, src/lib/dates.ts). Moving it into Postgres makes
-- it the single source of truth shared by the mobile app and the new web app.
--
-- These tables are PUBLIC REFERENCE DATA: readable by anyone (anon + authenticated),
-- never written by end users. Writes happen only via the seed (db owner) or the
-- dashboard. Row ids are the same stable slugs the app already used ('fajr-on-time',
-- 'fajr-routine', …) so saved habits — which link a preset to a habit only by name —
-- are unaffected, and both clients reference catalog rows by the identical slug.
--
-- Idempotent: `create table if not exists`, and each policy is dropped-then-created,
-- so this can be applied via `supabase db query --linked -f` and re-run safely.

-- Habit categories (the section headers in Discover).
create table if not exists public.categories (
  id         text primary key,
  title      text not null,
  sort_order integer not null default 0
);

-- The curated, evidence-backed habit/worship preset library.
create table if not exists public.presets (
  id               text primary key,
  category_id      text not null references public.categories (id),
  name             text not null,
  detail           text not null,
  evidence         text not null,
  default_schedule integer[] not null default '{}', -- weekday indices 0=Sun..6=Sat; '{}' => Hijri-scheduled
  hijri_schedule   jsonb,                            -- Hijri recurrence (monthDays/dates/months) or null
  target_count     integer,                          -- numeric daily target ("count goal") or null
  target_unit      text,                             -- unit label for the count ("cups", "servings") or null
  essential        boolean not null default false,   -- part of the one-tap starter set
  sort_order       integer not null default 0
);
create index if not exists presets_category_id_idx on public.presets (category_id);

-- Curated routines ("stacks") — a sequence of presets that belong together.
create table if not exists public.routines (
  id         text primary key,
  name       text not null,
  detail     text not null,
  sort_order integer not null default 0
);

-- Ordered membership of a routine (routine -> presets, in sequence).
create table if not exists public.routine_presets (
  routine_id text not null references public.routines (id) on delete cascade,
  preset_id  text not null references public.presets (id),
  position   integer not null,
  primary key (routine_id, preset_id)
);

-- Umm al-Qura month names (1..12), for calendar display (the web app needs these;
-- the mobile app keeps its own bundled copy for synchronous date code).
create table if not exists public.hijri_months (
  month smallint primary key check (month between 1 and 12),
  name  text not null
);

-- ── Public read access ────────────────────────────────────────────────────
-- Reference data: readable by anyone (anon + authenticated); no user write policies,
-- so RLS denies every insert/update/delete from the API.

alter table public.categories enable row level security;
drop policy if exists "Catalog is readable by everyone" on public.categories;
create policy "Catalog is readable by everyone" on public.categories for select using (true);
grant select on public.categories to anon, authenticated;

alter table public.presets enable row level security;
drop policy if exists "Catalog is readable by everyone" on public.presets;
create policy "Catalog is readable by everyone" on public.presets for select using (true);
grant select on public.presets to anon, authenticated;

alter table public.routines enable row level security;
drop policy if exists "Catalog is readable by everyone" on public.routines;
create policy "Catalog is readable by everyone" on public.routines for select using (true);
grant select on public.routines to anon, authenticated;

alter table public.routine_presets enable row level security;
drop policy if exists "Catalog is readable by everyone" on public.routine_presets;
create policy "Catalog is readable by everyone" on public.routine_presets for select using (true);
grant select on public.routine_presets to anon, authenticated;

alter table public.hijri_months enable row level security;
drop policy if exists "Catalog is readable by everyone" on public.hijri_months;
create policy "Catalog is readable by everyone" on public.hijri_months for select using (true);
grant select on public.hijri_months to anon, authenticated;
