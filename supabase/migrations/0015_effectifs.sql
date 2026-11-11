-- Effectifs par groupe : un effectif initial (rentrée), puis des arrivées et des départs datés.
-- L'effectif à une date = initial + arrivées - départs jusqu'à cette date.
create table if not exists public.headcounts (
  id         uuid primary key default gen_random_uuid(),
  group_code text not null references public.groups (code) on delete cascade,
  day        date not null,
  kind       text not null check (kind in ('initial', 'arrivee', 'depart')),
  n          smallint not null check (n between 0 and 60),
  note       text check (note is null or char_length(note) <= 120),
  created_at timestamptz not null default now(),
  check (kind = 'initial' or n >= 1)
);
create unique index if not exists headcounts_initial_idx on public.headcounts (group_code) where kind = 'initial';
create index if not exists headcounts_group_day_idx on public.headcounts (group_code, day);

alter table public.headcounts enable row level security;
drop policy if exists headcounts_read on public.headcounts;
create policy headcounts_read on public.headcounts for select to authenticated using (public.is_active());
drop policy if exists headcounts_admin on public.headcounts;
create policy headcounts_admin on public.headcounts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.headcounts to authenticated;
