-- ===========================================================================
-- Parc MELEC, migration 0002 : images, outils, réglages (logos), calendrier,
-- semainier et fiches. À exécuter APRÈS 0001_init.sql.
-- ===========================================================================

-- Images : adresse (URL) d'une image hébergée dans un Drive partagé ou ailleurs
alter table public.systems add column if not exists image_url text
  check (image_url is null or image_url ~* '^https?://');

-- Catalogue des TP : domaines d'activité du semainier, enseignant et objectif
alter table public.tps drop constraint if exists tps_domain_check;
alter table public.tps add constraint tps_domain_check
  check (domain in ('ind', 'ter', 'bat', 'tra', 'ate', 'ann', 'pen', 'ten', 'hab', 'rem'));
alter table public.tps add column if not exists objective text;
alter table public.tps add column if not exists teacher_id uuid references public.profiles (id) on delete set null;
alter table public.tps add column if not exists teacher_label text;
alter table public.tps add column if not exists sequence_name text;

-- ---------------------------------------------------------------------------
-- Outils (liste gérée par le gestionnaire)
-- ---------------------------------------------------------------------------
create table if not exists public.tools (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  ref        text check (char_length(ref) <= 80),
  category   text check (char_length(category) <= 60),
  qty        int not null default 1 check (qty >= 0 and qty <= 9999),
  room_id    uuid references public.rooms (id) on delete set null,
  state      text not null default 'ok' check (state in ('ok', 'usage', 'hs')),
  image_url  text check (image_url is null or image_url ~* '^https?://'),
  notes      text check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Réglages : titre, logos, année scolaire, jours affichés
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key   text primary key check (key ~ '^[a-z_]{1,40}$'),
  value text not null default '' check (char_length(value) <= 2000)
);
insert into public.settings (key, value) values
  ('site_title', 'Parc MELEC'),
  ('site_logo_url', ''),
  ('school_logo_url', ''),
  ('year_start', '2026-09-01'),
  ('year_end', '2027-07-03'),
  ('shown_days', '1,2,3,4')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Calendrier : vacances, jours fériés et autres périodes sans cours
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_periods (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('vacances', 'ferie', 'autre')),
  label      text not null check (char_length(btrim(label)) between 1 and 60),
  start_date date not null,
  end_date   date not null,
  check (end_date >= start_date)
);

-- ---------------------------------------------------------------------------
-- Semainier : ce que fait chaque groupe chaque jour
-- ---------------------------------------------------------------------------
create table if not exists public.planning_cells (
  day        date not null,
  group_code text not null references public.groups (code) on delete cascade,
  tp_id      uuid references public.tps (id) on delete set null,
  label      text check (char_length(label) <= 60),
  note       text check (char_length(note) <= 300),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (day, group_code),
  check (tp_id is not null or label is not null or note is not null)
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;
drop trigger if exists planning_cells_touch on public.planning_cells;
create trigger planning_cells_touch before update on public.planning_cells
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Fiches séquence et fiches séance
-- ---------------------------------------------------------------------------
create table if not exists public.fiches (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('sequence', 'seance')),
  title      text not null check (char_length(btrim(title)) between 1 and 160),
  level      text check (level in ('Seconde', 'Première', 'Terminale')),
  tp_id      uuid references public.tps (id) on delete set null,
  data       jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 100000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists fiches_touch on public.fiches;
create trigger fiches_touch before update on public.fiches
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Règles d'accès (RLS)
-- ---------------------------------------------------------------------------
alter table public.tools enable row level security;
alter table public.settings enable row level security;
alter table public.calendar_periods enable row level security;
alter table public.planning_cells enable row level security;
alter table public.fiches enable row level security;

create policy tools_read on public.tools for select to authenticated using (public.is_active());
create policy tools_admin on public.tools for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Logos et titre visibles dès la page de connexion, le reste réservé aux comptes actifs
create policy settings_public on public.settings for select to anon, authenticated
  using (key in ('site_title', 'site_logo_url', 'school_logo_url'));
create policy settings_read on public.settings for select to authenticated using (public.is_active());
create policy settings_admin on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy calendar_read on public.calendar_periods for select to authenticated using (public.is_active());
create policy calendar_admin on public.calendar_periods for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy cells_read on public.planning_cells for select to authenticated using (public.is_active());
create policy cells_insert on public.planning_cells for insert to authenticated with check (public.can_write());
create policy cells_update on public.planning_cells for update to authenticated
  using (public.can_write()) with check (public.can_write());
create policy cells_delete on public.planning_cells for delete to authenticated using (public.can_write());

create policy fiches_read on public.fiches for select to authenticated using (public.is_active());
create policy fiches_insert on public.fiches for insert to authenticated
  with check (public.can_write() and created_by = auth.uid());
create policy fiches_update on public.fiches for update to authenticated
  using (public.is_admin() or (public.can_write() and created_by = auth.uid()))
  with check (public.is_admin() or (public.can_write() and created_by = auth.uid()));
create policy fiches_delete on public.fiches for delete to authenticated
  using (public.is_admin() or (public.can_write() and created_by = auth.uid()));

-- Droits : les nouvelles tables héritent des droits par défaut de Supabase, on les referme
revoke all on all tables in schema public from anon;
grant select on public.settings to anon;
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Mises à jour en direct
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['tools', 'settings', 'calendar_periods', 'planning_cells', 'fiches'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then
        null;
      end;
    end loop;
  end if;
end
$$;
