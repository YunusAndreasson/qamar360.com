-- A user's own photo, in place of the initial the Settings screen derives from their email.
--
-- The photo is *not* public. It lives in a private bucket whose first path segment is the
-- owner's uid, and every policy below is that one rule: you may touch an object in `avatars`
-- only if the folder it sits in is named after you. The app never builds a public URL — it
-- asks for a short-lived signed one, which is only issued because of the read policy here.
--
-- `avatar_path` holds the object's key (`<uid>/<epoch-ms>.jpg`), not a URL: a URL would expire
-- in storage while the row kept promising it. The name carries a timestamp rather than being a
-- fixed `avatar.jpg` so replacing the photo produces a new key — otherwise every image cache
-- between here and the screen would go on showing the old face.

alter table public.users
  add column avatar_path text,
  add constraint users_avatar_path_owned_check check (
    avatar_path is null or avatar_path like id::text || '/%'
  );

-- 2 MB is generous for a square profile photo the app already compresses to JPEG; the mime
-- allow-list is what stops the bucket becoming general-purpose file storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- One rule, four verbs. `foldername(name)[1]` is the first path segment — the owner's uid.
drop policy if exists "Avatars are readable by their owner" on storage.objects;
create policy "Avatars are readable by their owner"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Avatars are written by their owner" on storage.objects;
create policy "Avatars are written by their owner"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Avatars are replaced by their owner" on storage.objects;
create policy "Avatars are replaced by their owner"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists "Avatars are deleted by their owner" on storage.objects;
create policy "Avatars are deleted by their owner"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
