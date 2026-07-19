-- Make account deletion one-way and atomic from the Auth user.
--
-- The Edge Function used to delete public.users first and auth.users second. If the second
-- operation failed, the caller kept their login but had already lost every habit and completion.
-- Cascading this ownership FK lets the function perform one Auth deletion: Postgres either deletes
-- the auth row and all application data together, or rolls the operation back together.

do $$
declare
  fk record;
begin
  for fk in
    select conname
    from pg_constraint
    where contype = 'f'
      and conrelid = 'public.users'::regclass
      and confrelid = 'auth.users'::regclass
  loop
    execute format('alter table public.users drop constraint %I', fk.conname);
  end loop;
end
$$;

alter table public.users
  add constraint users_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;
