-- Boîte à idées : tout compte actif peut proposer une amélioration et voter ; les gestionnaires répondent et changent le statut.
create table if not exists public.ideas (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 3 and 120),
  body        text check (char_length(body) <= 2000),
  category    text not null default 'autre' check (category in ('fonction', 'affichage', 'donnees', 'autre')),
  status      text not null default 'nouvelle' check (status in ('nouvelle', 'etudiee', 'retenue', 'faite', 'refusee')),
  answer      text check (char_length(answer) <= 1000),
  votes       uuid[] not null default '{}',
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.ideas enable row level security;
drop policy if exists ideas_read on public.ideas;
drop policy if exists ideas_insert on public.ideas;
drop policy if exists ideas_admin on public.ideas;
create policy ideas_read on public.ideas for select to authenticated using (public.is_active());
create policy ideas_insert on public.ideas for insert to authenticated
  with check (public.is_active() and created_by = auth.uid() and status = 'nouvelle' and votes = '{}' and answer is null);
create policy ideas_admin on public.ideas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.ideas from anon;
grant select, insert, update, delete on public.ideas to authenticated;

-- Voter (ou retirer son vote) : la liste des votes ne se modifie que par cette fonction
create or replace function public.toggle_idea_vote(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active() then raise exception 'Compte inactif'; end if;
  update public.ideas
     set votes = case when auth.uid() = any (votes) then array_remove(votes, auth.uid()) else array_append(votes, auth.uid()) end
   where id = p_id;
end $$;
revoke all on function public.toggle_idea_vote(uuid) from public, anon;
grant execute on function public.toggle_idea_vote(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.ideas;
    exception when duplicate_object then
      null;
    end;
  end if;
end
$$;
