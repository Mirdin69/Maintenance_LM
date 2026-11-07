-- Parc MELEC - Lycée La Mâche
-- Schéma initial : comptes, groupes, salles, systèmes, emploi du temps, séances,
-- maintenance, achats, élèves. À exécuter une seule fois (SQL Editor de Supabase
-- ou `supabase db push`).

-- ---------------------------------------------------------------------------
-- Comptes : seules les adresses @lamache.org peuvent créer un compte
-- ---------------------------------------------------------------------------

create or replace function public.enforce_school_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null or lower(new.email) !~ '^[^@[:space:]]+@lamache\.org$' then
    raise exception 'Seules les adresses @lamache.org sont autorisées.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_school_domain on auth.users;
create trigger enforce_school_domain
  before insert or update of email on auth.users
  for each row execute function public.enforce_school_domain();

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  role        text not null default 'prof' check (role in ('admin', 'prof', 'lecture')),
  active      boolean not null default false,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz
);

comment on column public.profiles.active is
  'Faux tant qu''un gestionnaire n''a pas validé le compte (sauf le tout premier compte).';

-- Fonctions d'aide pour les règles de sécurité (security definer pour éviter la récursion RLS)
create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and active) $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin') $$;

create or replace function public.can_write()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and active and role in ('admin', 'prof')) $$;

-- Création du profil : le premier compte devient gestionnaire actif, les suivants
-- attendent la validation d'un gestionnaire.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_user boolean;
begin
  select not exists (select 1 from public.profiles) into first_user;
  insert into public.profiles (id, email, role, active)
  values (new.id, lower(new.email), case when first_user then 'admin' else 'prof' end, first_user);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- On ne peut pas retirer le dernier gestionnaire actif
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if not exists (
      select 1 from public.profiles
      where id <> old.id and role = 'admin' and active
    ) then
      raise exception 'Il doit rester au moins un gestionnaire actif.';
    end if;
  end if;
  return new;
end;
$$;

create trigger protect_last_admin
  before update on public.profiles
  for each row execute function public.protect_last_admin();

-- Un utilisateur modifie seulement son nom et sa date de dernière visite
create or replace function public.set_my_name(p_name text)
returns void language sql security definer set search_path = ''
as $$ update public.profiles set full_name = nullif(btrim(p_name), '') where id = auth.uid() $$;

create or replace function public.touch_me()
returns void language sql security definer set search_path = ''
as $$ update public.profiles set last_seen = now() where id = auth.uid() $$;

-- ---------------------------------------------------------------------------
-- Groupes : 3 niveaux x 3 groupes (2PB1.1 = seconde pro, groupe B1.1)
-- ---------------------------------------------------------------------------

create table public.groups (
  code   text primary key,
  level  text not null check (level in ('Seconde', 'Première', 'Terminale')),
  sub    text not null check (sub in ('B1.1', 'B1.2', 'B2')),
  sort   int  not null
);

insert into public.groups (code, level, sub, sort) values
  ('2PB1.1', 'Seconde',   'B1.1', 1), ('2PB1.2', 'Seconde',   'B1.2', 2), ('2PB2', 'Seconde',   'B2', 3),
  ('1PB1.1', 'Première',  'B1.1', 4), ('1PB1.2', 'Première',  'B1.2', 5), ('1PB2', 'Première',  'B2', 6),
  ('TPB1.1', 'Terminale', 'B1.1', 7), ('TPB1.2', 'Terminale', 'B1.2', 8), ('TPB2', 'Terminale', 'B2', 9);

create table public.teacher_groups (
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  group_code  text not null references public.groups (code) on delete cascade,
  primary key (profile_id, group_code)
);

-- ---------------------------------------------------------------------------
-- Salles et systèmes
-- ---------------------------------------------------------------------------

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (length(btrim(name)) > 0),
  building    text,
  kind        text not null default 'salle' check (kind in ('atelier', 'salle', 'labo', 'info', 'autre')),
  seats       int check (seats is null or seats > 0),
  shared      boolean not null default false,
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on column public.rooms.shared is
  'Vrai si plusieurs groupes peuvent utiliser la salle en même temps (grand atelier).';

create table public.systems (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  ref         text,
  domain      text not null default 'ind' check (domain in ('ind', 'ter', 'bat', 'tra')),
  room_id     uuid references public.rooms (id) on delete set null,
  qty         int  not null default 1 check (qty > 0),
  state       text not null default 'service' check (state in ('service', 'maint', 'hs')),
  notes       text,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.tps (
  id           uuid primary key default gen_random_uuid(),
  code         text,
  title        text not null check (length(btrim(title)) > 0),
  level        text not null check (level in ('Seconde', 'Première', 'Terminale')),
  domain       text not null default 'ind' check (domain in ('ind', 'ter', 'bat', 'tra')),
  hours        numeric(4, 1) check (hours is null or hours > 0),
  system_ids   uuid[] not null default '{}',
  competences  text[] not null default '{}',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Emploi du temps hebdomadaire et séances datées
-- ---------------------------------------------------------------------------

create table public.timetable_slots (
  id             uuid primary key default gen_random_uuid(),
  room_id        uuid not null references public.rooms (id) on delete restrict,
  group_code     text not null references public.groups (code),
  teacher_id     uuid references public.profiles (id) on delete set null,
  teacher_label  text,
  weekday        smallint not null check (weekday between 1 and 5),
  start_time     time not null,
  end_time       time not null,
  label          text,
  tp_id          uuid references public.tps (id) on delete set null,
  system_id      uuid references public.systems (id) on delete set null,
  valid_from     date not null,
  valid_to       date not null,
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  check (end_time > start_time),
  check (valid_to >= valid_from)
);

create index timetable_slots_room_idx  on public.timetable_slots (room_id, weekday);
create index timetable_slots_group_idx on public.timetable_slots (group_code, weekday);

-- Une séance datée : TP réalisé, réservation ponctuelle, déplacement ou annulation
-- d'une occurrence de l'emploi du temps (slot_id renseigné).
create table public.sessions (
  id             uuid primary key default gen_random_uuid(),
  slot_id        uuid references public.timetable_slots (id) on delete set null,
  session_date   date not null,
  start_time     time not null,
  end_time       time not null,
  room_id        uuid references public.rooms (id) on delete set null,
  group_code     text references public.groups (code),
  tp_id          uuid references public.tps (id) on delete set null,
  system_id      uuid references public.systems (id) on delete set null,
  teacher_id     uuid default auth.uid() references public.profiles (id) on delete set null,
  teacher_label  text,
  label          text,
  note           text,
  status         text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  check (end_time > start_time)
);

create unique index sessions_slot_date_uidx on public.sessions (slot_id, session_date) where slot_id is not null;
create index sessions_date_idx on public.sessions (session_date);
create index sessions_room_date_idx on public.sessions (room_id, session_date);

-- ---------------------------------------------------------------------------
-- Maintenance et achats
-- ---------------------------------------------------------------------------

create table public.maintenance (
  id           uuid primary key default gen_random_uuid(),
  system_id    uuid not null references public.systems (id) on delete cascade,
  kind         text not null default 'corr' check (kind in ('prev', 'corr')),
  title        text not null check (length(btrim(title)) > 0),
  description  text,
  priority     text not null default 'n' check (priority in ('n', 'h', 'u')),
  due_date     date,
  status       text not null default 'open' check (status in ('open', 'wip', 'done')),
  closed_at    timestamptz,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.maintenance_notes (
  id              uuid primary key default gen_random_uuid(),
  maintenance_id  uuid not null references public.maintenance (id) on delete cascade,
  author_id       uuid default auth.uid() references public.profiles (id) on delete set null,
  text            text not null check (length(btrim(text)) > 0),
  created_at      timestamptz not null default now()
);

create or replace function public.maintenance_closed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.closed_at := now();
  elsif new.status <> 'done' then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

create trigger maintenance_closed_at
  before insert or update on public.maintenance
  for each row execute function public.maintenance_closed_at();

create table public.purchases (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null default 'mat' check (kind in ('mat', 'conso')),
  item           text not null check (length(btrim(item)) > 0),
  ref            text,
  qty            int not null default 1 check (qty > 0),
  unit_price     numeric(10, 2) not null default 0 check (unit_price >= 0),
  system_id      uuid references public.systems (id) on delete set null,
  justification  text,
  urgent         boolean not null default false,
  status         text not null default 'req' check (status in ('req', 'ok', 'ord', 'recv', 'no')),
  requested_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- Un enseignant modifie seulement ses demandes non traitées, sans toucher au statut
create or replace function public.purchases_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not public.is_admin() then
    if old.requested_by is distinct from auth.uid() or old.status <> 'req' then
      raise exception 'Seul un gestionnaire peut modifier cette demande.';
    end if;
    if new.status <> old.status then
      raise exception 'Seul un gestionnaire peut changer le statut d''une demande.';
    end if;
  end if;
  if tg_op = 'INSERT' and new.status <> 'req' and not public.is_admin() then
    raise exception 'Une nouvelle demande doit avoir le statut « demandée ».';
  end if;
  return new;
end;
$$;

create trigger purchases_guard
  before insert or update on public.purchases
  for each row execute function public.purchases_guard();

-- ---------------------------------------------------------------------------
-- Élèves et progression
-- ---------------------------------------------------------------------------

create table public.students (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  group_code  text not null references public.groups (code),
  created_at  timestamptz not null default now()
);

create index students_group_idx on public.students (group_code);

create table public.progress (
  student_id  uuid not null references public.students (id) on delete cascade,
  tp_id       uuid not null references public.tps (id) on delete cascade,
  level       text not null check (level in ('NA', 'ECA', 'PA', 'A')),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  primary key (student_id, tp_id)
);

-- ---------------------------------------------------------------------------
-- Occupation des salles et détection de conflits
-- ---------------------------------------------------------------------------

create or replace function public.weekday_name(d int)
returns text language sql immutable
as $$ select (array['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'])[d] $$;

-- Occurrences effectives entre deux dates : emploi du temps hebdomadaire, où une séance
-- liée remplace l'occurrence du jour (déplacement ou annulation), plus les séances ponctuelles.
create or replace function public.room_occupancy(p_from date, p_to date)
returns table (
  source text, ref_id uuid, slot_id uuid, occ_date date,
  start_time time, end_time time, room_id uuid, group_code text,
  teacher_id uuid, teacher_label text, label text, tp_id uuid, system_id uuid
)
language sql stable
set search_path = public
as $$
  select 'slot'::text, s.id, s.id, g.d::date,
         s.start_time, s.end_time, s.room_id, s.group_code,
         s.teacher_id, s.teacher_label, s.label, s.tp_id, s.system_id
  from public.timetable_slots s
  cross join lateral generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g(d)
  where extract(isodow from g.d)::int = s.weekday
    and g.d::date between s.valid_from and s.valid_to
    and not exists (
      select 1 from public.sessions x
      where x.slot_id = s.id and x.session_date = g.d::date
    )
  union all
  select 'session'::text, x.id, x.slot_id, x.session_date,
         x.start_time, x.end_time, x.room_id, x.group_code,
         x.teacher_id, x.teacher_label, x.label, x.tp_id, x.system_id
  from public.sessions x
  where x.session_date between p_from and p_to
    and x.status <> 'cancelled';
$$;

create or replace function public.fmt_hm(t time)
returns text language sql immutable as $$ select to_char(t, 'HH24:MI') $$;

-- Conflit pour une séance datée : même salle (hors salle partagée), même groupe, même enseignant
create or replace function public.assert_no_conflict(
  p_date date, p_start time, p_end time,
  p_room uuid, p_group text, p_teacher uuid, p_teacher_label text,
  p_exclude_session uuid, p_exclude_slot uuid
) returns void
language plpgsql
set search_path = public
as $$
declare
  o record;
  r public.rooms;
  who text;
begin
  if p_room is not null then
    select * into r from public.rooms where id = p_room;
  end if;

  for o in
    select * from public.room_occupancy(p_date, p_date) x
    where x.start_time < p_end and p_start < x.end_time
      and (p_exclude_session is null or x.source <> 'session' or x.ref_id <> p_exclude_session)
      and (p_exclude_slot is null or x.source <> 'slot' or x.slot_id <> p_exclude_slot)
  loop
    who := coalesce(o.group_code, o.label, 'une réservation');
    if p_room is not null and o.room_id = p_room and not r.shared then
      raise exception 'Conflit de salle : % est déjà occupée le % de % à % (%).',
        r.name, to_char(p_date, 'DD/MM/YYYY'), public.fmt_hm(o.start_time), public.fmt_hm(o.end_time), who
        using errcode = '23P01', hint = 'room';
    end if;
    if p_group is not null and o.group_code = p_group then
      raise exception 'Conflit de groupe : % a déjà cours le % de % à %.',
        p_group, to_char(p_date, 'DD/MM/YYYY'), public.fmt_hm(o.start_time), public.fmt_hm(o.end_time)
        using errcode = '23P01', hint = 'group';
    end if;
    if (p_teacher is not null and o.teacher_id = p_teacher)
       or (p_teacher is null and p_teacher_label is not null and lower(o.teacher_label) = lower(p_teacher_label)) then
      raise exception 'Conflit d''enseignant : déjà occupé le % de % à %.',
        to_char(p_date, 'DD/MM/YYYY'), public.fmt_hm(o.start_time), public.fmt_hm(o.end_time)
        using errcode = '23P01', hint = 'teacher';
    end if;
  end loop;
end;
$$;

create or replace function public.check_session_conflicts()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'cancelled' then
    return new;
  end if;
  perform pg_advisory_xact_lock(7001);
  perform public.assert_no_conflict(
    new.session_date, new.start_time, new.end_time,
    new.room_id, new.group_code, new.teacher_id, new.teacher_label,
    new.id, new.slot_id
  );
  return new;
end;
$$;

create trigger check_session_conflicts
  before insert or update on public.sessions
  for each row execute function public.check_session_conflicts();

-- Conflit pour une ligne d'emploi du temps hebdomadaire (sur toute sa période de validité)
create or replace function public.check_slot_conflicts()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  c record;
  r public.rooms;
  x record;
begin
  perform pg_advisory_xact_lock(7001);
  select * into r from public.rooms where id = new.room_id;

  for c in
    select * from public.timetable_slots s
    where s.id is distinct from new.id
      and s.weekday = new.weekday
      and s.start_time < new.end_time and new.start_time < s.end_time
      and s.valid_from <= new.valid_to and new.valid_from <= s.valid_to
  loop
    if c.room_id = new.room_id and not r.shared then
      raise exception 'Conflit de salle : % est déjà occupée le % de % à % (%).',
        r.name, public.weekday_name(new.weekday), public.fmt_hm(c.start_time), public.fmt_hm(c.end_time), c.group_code
        using errcode = '23P01', hint = 'room';
    end if;
    if c.group_code = new.group_code then
      raise exception 'Conflit de groupe : % a déjà cours le % de % à %.',
        new.group_code, public.weekday_name(new.weekday), public.fmt_hm(c.start_time), public.fmt_hm(c.end_time)
        using errcode = '23P01', hint = 'group';
    end if;
    if (new.teacher_id is not null and c.teacher_id = new.teacher_id)
       or (new.teacher_id is null and new.teacher_label is not null and lower(c.teacher_label) = lower(new.teacher_label)) then
      raise exception 'Conflit d''enseignant : déjà occupé le % de % à %.',
        public.weekday_name(new.weekday), public.fmt_hm(c.start_time), public.fmt_hm(c.end_time)
        using errcode = '23P01', hint = 'teacher';
    end if;
  end loop;

  -- Séances ponctuelles déjà posées dans cette salle sur la période
  if not r.shared then
    for x in
      select * from public.sessions s
      where s.slot_id is null and s.status <> 'cancelled'
        and s.room_id = new.room_id
        and extract(isodow from s.session_date)::int = new.weekday
        and s.session_date between new.valid_from and new.valid_to
        and s.start_time < new.end_time and new.start_time < s.end_time
      limit 1
    loop
      raise exception 'Conflit de salle : % est réservée le % de % à % (%).',
        r.name, to_char(x.session_date, 'DD/MM/YYYY'), public.fmt_hm(x.start_time), public.fmt_hm(x.end_time),
        coalesce(x.group_code, x.label, 'réservation')
        using errcode = '23P01', hint = 'room';
    end loop;
  end if;
  return new;
end;
$$;

create trigger check_slot_conflicts
  before insert or update on public.timetable_slots
  for each row execute function public.check_slot_conflicts();

-- ---------------------------------------------------------------------------
-- Sécurité par ligne (RLS)
-- ---------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.groups            enable row level security;
alter table public.teacher_groups    enable row level security;
alter table public.rooms             enable row level security;
alter table public.systems           enable row level security;
alter table public.tps               enable row level security;
alter table public.timetable_slots   enable row level security;
alter table public.sessions          enable row level security;
alter table public.maintenance       enable row level security;
alter table public.maintenance_notes enable row level security;
alter table public.purchases         enable row level security;
alter table public.students          enable row level security;
alter table public.progress          enable row level security;

-- Profils : chacun voit le sien (même en attente), les comptes actifs voient tout le monde
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Lecture : tout compte actif. Écriture : voir chaque table.
create policy groups_read on public.groups for select to authenticated using (public.is_active());

create policy teacher_groups_read on public.teacher_groups for select to authenticated using (public.is_active());
create policy teacher_groups_admin on public.teacher_groups for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy rooms_read on public.rooms for select to authenticated using (public.is_active());
create policy rooms_admin on public.rooms for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy systems_read on public.systems for select to authenticated using (public.is_active());
create policy systems_insert on public.systems for insert to authenticated with check (public.can_write());
create policy systems_update on public.systems for update to authenticated
  using (public.can_write()) with check (public.can_write());
create policy systems_delete on public.systems for delete to authenticated using (public.is_admin());

create policy tps_read on public.tps for select to authenticated using (public.is_active());
create policy tps_insert on public.tps for insert to authenticated with check (public.can_write());
create policy tps_update on public.tps for update to authenticated
  using (public.can_write()) with check (public.can_write());
create policy tps_delete on public.tps for delete to authenticated using (public.is_admin());

-- Emploi du temps : gestionnaire pour tout, enseignant pour ses propres lignes
create policy slots_read on public.timetable_slots for select to authenticated using (public.is_active());
create policy slots_insert on public.timetable_slots for insert to authenticated
  with check (public.is_admin() or (public.can_write() and teacher_id = auth.uid()));
create policy slots_update on public.timetable_slots for update to authenticated
  using (public.is_admin() or (public.can_write() and teacher_id = auth.uid()))
  with check (public.is_admin() or (public.can_write() and teacher_id = auth.uid()));
create policy slots_delete on public.timetable_slots for delete to authenticated
  using (public.is_admin() or (public.can_write() and teacher_id = auth.uid()));

create policy sessions_read on public.sessions for select to authenticated using (public.is_active());
create policy sessions_insert on public.sessions for insert to authenticated with check (public.can_write());
create policy sessions_update on public.sessions for update to authenticated
  using (public.can_write()) with check (public.can_write());
create policy sessions_delete on public.sessions for delete to authenticated using (public.can_write());

create policy maintenance_read on public.maintenance for select to authenticated using (public.is_active());
create policy maintenance_insert on public.maintenance for insert to authenticated with check (public.can_write());
create policy maintenance_update on public.maintenance for update to authenticated
  using (public.can_write()) with check (public.can_write());
create policy maintenance_delete on public.maintenance for delete to authenticated using (public.is_admin());

create policy maintenance_notes_read on public.maintenance_notes for select to authenticated using (public.is_active());
create policy maintenance_notes_insert on public.maintenance_notes for insert to authenticated
  with check (public.can_write() and author_id = auth.uid());
create policy maintenance_notes_delete on public.maintenance_notes for delete to authenticated
  using (public.is_admin() or author_id = auth.uid());

create policy purchases_read on public.purchases for select to authenticated using (public.is_active());
create policy purchases_insert on public.purchases for insert to authenticated
  with check (public.can_write() and requested_by = auth.uid());
create policy purchases_update on public.purchases for update to authenticated
  using (public.is_admin() or (public.can_write() and requested_by = auth.uid() and status = 'req'))
  with check (public.is_admin() or public.can_write());
create policy purchases_delete on public.purchases for delete to authenticated
  using (public.is_admin() or (public.can_write() and requested_by = auth.uid() and status = 'req'));

create policy students_read on public.students for select to authenticated using (public.is_active());
create policy students_insert on public.students for insert to authenticated with check (public.can_write());
create policy students_update on public.students for update to authenticated
  using (public.can_write()) with check (public.can_write());
create policy students_delete on public.students for delete to authenticated using (public.is_admin());

create policy progress_read on public.progress for select to authenticated using (public.is_active());
create policy progress_insert on public.progress for insert to authenticated with check (public.can_write());
create policy progress_update on public.progress for update to authenticated
  using (public.can_write()) with check (public.can_write());
create policy progress_delete on public.progress for delete to authenticated using (public.can_write());

-- ---------------------------------------------------------------------------
-- Droits d'accès : rien pour les visiteurs anonymes
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;
revoke execute on function public.touch_me() from public;
revoke execute on function public.set_my_name(text) from public;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.touch_me() to authenticated;
grant execute on function public.set_my_name(text) to authenticated;
grant execute on function public.room_occupancy(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Mises à jour en direct (Supabase Realtime)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array[
      'profiles', 'teacher_groups', 'rooms', 'systems', 'tps', 'timetable_slots', 'sessions',
      'maintenance', 'maintenance_notes', 'purchases', 'students', 'progress'
    ] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then
        null;
      end;
    end loop;
  end if;
end
$$;
