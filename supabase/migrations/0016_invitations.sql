-- Invitations : un gestionnaire invite une adresse @lamache.org avec un rôle et des groupes ;
-- à la première connexion, le compte est créé déjà validé, avec ce rôle et ces groupes.
create table if not exists public.invitations (
  email       text primary key check (email = lower(email) and email ~ '^[^@[:space:]]+@lamache\.org$'),
  role        text not null default 'prof' check (role in ('admin', 'prof', 'lecture')),
  group_codes text[] not null default '{}' check (cardinality(group_codes) <= 20),
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.invitations enable row level security;
drop policy if exists invitations_admin on public.invitations;
create policy invitations_admin on public.invitations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.invitations to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_user boolean;
  inv public.invitations;
begin
  select not exists (select 1 from public.profiles) into first_user;
  select * into inv from public.invitations where email = lower(new.email);
  if found then
    insert into public.profiles (id, email, role, active) values (new.id, lower(new.email), inv.role, true);
    insert into public.teacher_groups (profile_id, group_code)
      select new.id, g from unnest(inv.group_codes) as g where exists (select 1 from public.groups where code = g)
      on conflict do nothing;
    delete from public.invitations where email = inv.email;
  else
    insert into public.profiles (id, email, role, active)
    values (new.id, lower(new.email), case when first_user then 'admin' else 'prof' end, first_user);
  end if;
  return new;
end;
$$;
