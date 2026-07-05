-- Auto-provision a public.users row when an auth user is created.
--
-- There is no signup trigger today, so each client self-provisions its public.users
-- row before its first write (ensureUserRow in the mobile app's use-habits hook). As
-- the new web app also needs a users row before creating habits, centralize the
-- provisioning here so neither client has to. The mobile app's ensureUserRow can stay
-- as a harmless idempotent safety net.
--
-- security definer so the insert runs as the function owner and bypasses the RLS on
-- public.users. Additive + idempotent: existing users already have rows, and the
-- on-conflict makes the trigger and this migration safe to re-run.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
