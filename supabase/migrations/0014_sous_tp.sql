-- Sous-TP : un TP principal (affiché dans le semainier) peut regrouper des sous-TP qui tournent entre eux.
alter table public.tps
  add column if not exists parent_id uuid references public.tps (id) on delete set null;
alter table public.tps drop constraint if exists tps_parent_check;
alter table public.tps add constraint tps_parent_check check (parent_id is null or parent_id <> id);

-- Un seul niveau : un sous-TP n'a pas de sous-TP, et un TP qui a des sous-TP ne devient pas lui-même sous-TP.
create or replace function public.tps_parent_depth()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.tps where id = new.parent_id and parent_id is not null) then
      raise exception 'Un sous-TP ne peut pas être rattaché à un autre sous-TP.';
    end if;
    if exists (select 1 from public.tps where parent_id = new.id) then
      raise exception 'Ce TP a déjà des sous-TP : il ne peut pas devenir un sous-TP.';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists tps_parent_depth on public.tps;
create trigger tps_parent_depth before insert or update of parent_id on public.tps for each row execute function public.tps_parent_depth();

create index if not exists tps_parent_idx on public.tps (parent_id);
