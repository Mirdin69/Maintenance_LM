-- Semainier : demi-journées (matin / après-midi) et salle par case.
-- Les cases existantes deviennent des cases « journée entière » (part = 'J').
alter table public.planning_cells
  add column if not exists part text not null default 'J' check (part in ('J', 'M', 'A')),
  add column if not exists room_id uuid references public.rooms (id) on delete set null;

alter table public.planning_cells drop constraint if exists planning_cells_pkey;
alter table public.planning_cells add primary key (day, group_code, part);

-- Journal d'audit : la clé d'une case inclut désormais la demi-journée
create or replace function public.audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb;
  n jsonb;
  k text;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new); end if;
  if tg_op = 'UPDATE' and (o - 'updated_at') = (n - 'updated_at') then
    return null;
  end if;
  k := case tg_table_name
         when 'planning_cells' then (coalesce(n, o)->>'day') || '/' || (coalesce(n, o)->>'group_code') || '/' || coalesce(coalesce(n, o)->>'part', 'J')
         else coalesce(n, o)->>'id'
       end;
  insert into public.audit_log (user_id, table_name, op, row_key, old_data, new_data)
  values (auth.uid(), tg_table_name, tg_op, k, o, n);
  if random() < 0.01 then
    delete from public.audit_log where at < now() - interval '400 days';
  end if;
  return null;
end
$$;
revoke all on function public.audit() from public, anon, authenticated;
