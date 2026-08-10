-- One move, one write.
--
-- Reordering a habit renumbers `position` across everything after it and can change `stack_id`
-- too, and the client was sending that as one UPDATE per displaced row through `Promise.all`.
-- Nothing made those a unit: if some landed and some failed, the client rolled its own state back
-- to the order the user started from while the table kept a half-applied one — the arrangement
-- silently scrambled, and the error said only "could not save the new order".
--
-- This applies the whole batch in a single statement, so it either all lands or none of it does.
--
-- SECURITY INVOKER (the default, stated for the record): the function runs as the caller, so the
-- habits RLS policies still decide which rows are visible and writable. The explicit
-- `user_id = auth.uid()` is belt-and-braces — it also keeps the count below honest, so a batch
-- naming a row that isn't yours fails loudly instead of silently updating fewer rows than asked.
create or replace function public.apply_habit_order(items jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  asked int;
  applied int;
begin
  asked := jsonb_array_length(items);
  if asked = 0 then
    return;
  end if;

  with wanted as (
    select *
      from jsonb_to_recordset(items) as t(id uuid, "position" int, stack_id uuid)
  )
  update public.habits h
     set "position" = w."position",
         stack_id = w.stack_id,
         updated_at = now()
    from wanted w
   where h.id = w.id
     and h.user_id = auth.uid();

  get diagnostics applied = row_count;
  if applied <> asked then
    raise exception 'apply_habit_order: asked to move % rows, moved %', asked, applied;
  end if;
end;
$$;

comment on function public.apply_habit_order(jsonb) is
  'Apply a batch of habit position/stack_id changes atomically. items: [{id, position, stack_id}].';

revoke all on function public.apply_habit_order(jsonb) from public;
grant execute on function public.apply_habit_order(jsonb) to authenticated;
