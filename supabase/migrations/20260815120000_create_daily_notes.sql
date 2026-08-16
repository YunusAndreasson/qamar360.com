-- The day's note — what the day was actually like.
--
-- Everything else on Today records *what happened*: a stack sealed, an act ticked, a to-do struck
-- off. All of it is countable, and all of it feeds the lunar currency — degrees, the month ring,
-- the year trend. A note is the one thing on the day that is none of that. It earns nothing, it is
-- not scheduled, it cannot be complete, and nothing in `lib/progress.ts` or `lib/habit-stats.ts`
-- will ever read it. It is simply the day, in the user's own words.
--
-- Its own table for the same reason `tasks` got one (20260806120000_create_tasks.sql): a row with
-- no recurring schedule folded into `habits` would be re-walked by the progress sweep and would
-- silently rewrite the rates of months already closed.
--
-- One row per day, enforced. The day is this app's unit — it is what the header names, what the
-- stepper moves through, and what the moon grid draws — so "the day's note" has to be a single
-- thing you can point at. Speaking again appends to the same row (see `lib/notes.appendToBody`)
-- rather than making a second one, which keeps the archive one row per day and the day-stepper
-- mapping exact.
create table public.daily_notes (
  id uuid primary key default gen_random_uuid(),
  -- Cascading, so deleting the auth user still removes every trace in one transaction
  -- (see 20260719170000_cascade_user_deletion.sql — the Edge Function performs one deletion).
  user_id uuid not null references public.users (id) on delete cascade,
  -- The local day this is the note *for*, on the same `YYYY-MM-DD` key as
  -- `habit_completions.completed_at` and `tasks.due_on` — so the day-stepper reaches it without
  -- any translation, and a note written while browsing last Tuesday belongs to Tuesday.
  note_date date not null,
  body text not null default '',
  -- Seconds actually spoken, summed across appends; null when it was only ever typed.
  --
  -- The audio itself is never stored — not here, not in Storage, not on the filesystem. It is
  -- transcribed from memory a sentence at a time and dropped (see `hooks/use-dictation.ts`), so
  -- this integer is the only trace a recording leaves anywhere. It is kept because the archive
  -- row reads better with it: "2 min" tells you what kind of evening it was before you open it.
  spoken_seconds integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, note_date)
);

comment on column public.daily_notes.note_date is
  'The local day this is the note for. Unique per user — one note a day, appended to.';
comment on column public.daily_notes.spoken_seconds is
  'Seconds spoken, summed across appends; null if only typed. The one trace the audio leaves.';

-- Both queries the app makes: this user''s note for one day, and their notes newest-first for the
-- Journal. `desc` because the archive only ever reads backwards.
create index daily_notes_user_date_idx on public.daily_notes (user_id, note_date desc);

-- Row-level security, mirroring `tasks` exactly. This matters more here than anywhere else in the
-- schema: it is the only table holding what someone actually said.
alter table public.daily_notes enable row level security;

create policy "Users can read own notes" on public.daily_notes
  for select using (auth.uid() = user_id);
create policy "Users can create own notes" on public.daily_notes
  for insert with check (auth.uid() = user_id);
create policy "Users can update own notes" on public.daily_notes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own notes" on public.daily_notes
  for delete using (auth.uid() = user_id);
