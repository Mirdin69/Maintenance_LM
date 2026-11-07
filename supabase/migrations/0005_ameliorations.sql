-- 0005 : images déposées, historique, panne avec photo, maintenance préventive, PFMP, devis, outils des TP
-- À appliquer après 0004. Peut être rejouée sans dommage.

-- ---------------------------------------------------------------------------
-- TP et fiches : outils requis, ressource réutilisable
-- ---------------------------------------------------------------------------
alter table public.tps add column if not exists tool_ids uuid[] not null default '{}';
alter table public.tps add column if not exists reusable boolean not null default false;
alter table public.fiches add column if not exists reusable boolean not null default false;

-- ---------------------------------------------------------------------------
-- Achats : fournisseur et devis
-- ---------------------------------------------------------------------------
alter table public.purchases add column if not exists supplier text check (supplier is null or char_length(supplier) <= 120);
alter table public.purchases add column if not exists quote_ref text check (quote_ref is null or char_length(quote_ref) <= 80);
alter table public.purchases add column if not exists quote_url text check (quote_url is null or (quote_url ~* '^https?://' and char_length(quote_url) <= 1000));

-- ---------------------------------------------------------------------------
-- Maintenance : photo de la panne, lien avec un plan préventif
-- ---------------------------------------------------------------------------
alter table public.maintenance add column if not exists photo_url text
  check (photo_url is null or (photo_url ~* '^https?://' and char_length(photo_url) <= 1000));

create table if not exists public.maintenance_plans (
  id          uuid primary key default gen_random_uuid(),
  system_id   uuid not null references public.systems (id) on delete cascade,
  title       text not null check (length(btrim(title)) > 0 and char_length(title) <= 120),
  description text check (description is null or char_length(description) <= 1000),
  priority    text not null default 'n' check (priority in ('n', 'h', 'u')),
  every_days  integer not null check (every_days between 1 and 3650),
  next_due    date not null,
  checklist   jsonb not null default '[]'::jsonb
              check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 30),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table public.maintenance add column if not exists plan_id uuid references public.maintenance_plans (id) on delete set null;

-- Crée les interventions préventives arrivées à échéance et avance la prochaine date
create or replace function public.generate_due_maintenance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  n integer := 0;
  lines text;
begin
  if not public.can_write() then
    raise exception 'Droits insuffisants';
  end if;
  for p in select * from public.maintenance_plans where active and next_due <= current_date loop
    if not exists (select 1 from public.maintenance m where m.plan_id = p.id and m.status <> 'done') then
      select string_agg('- ' || value, E'\n') into lines from jsonb_array_elements_text(p.checklist);
      insert into public.maintenance (system_id, kind, title, description, priority, due_date, plan_id)
      values (p.system_id, 'prev', p.title,
              nullif(btrim(coalesce(p.description, '') || case when lines is null then '' else E'\n' || lines end), ''),
              p.priority, p.next_due, p.id);
      n := n + 1;
    end if;
    update public.maintenance_plans
      set next_due = p.next_due + (greatest(1, ceil((current_date - p.next_due + 1)::numeric / p.every_days))::int * p.every_days)
      where id = p.id;
  end loop;
  return n;
end
$$;
revoke all on function public.generate_due_maintenance() from public, anon;
grant execute on function public.generate_due_maintenance() to authenticated;

-- ---------------------------------------------------------------------------
-- PFMP : entreprises et périodes
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0 and char_length(name) <= 120),
  address    text check (address is null or char_length(address) <= 200),
  contact    text check (contact is null or char_length(contact) <= 120),
  phone      text check (phone is null or char_length(phone) <= 30),
  email      text check (email is null or char_length(email) <= 120),
  notes      text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.pfmp_periods (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  company_id  uuid references public.companies (id) on delete set null,
  start_date  date not null,
  end_date    date not null,
  tutor       text check (tutor is null or char_length(tutor) <= 120),
  visit_date  date,
  visit_by    text check (visit_by is null or char_length(visit_by) <= 120),
  evaluation  text check (evaluation is null or char_length(evaluation) <= 2000),
  status      text not null default 'planned' check (status in ('planned', 'ongoing', 'done')),
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists pfmp_student_idx on public.pfmp_periods (student_id);

-- ---------------------------------------------------------------------------
-- Historique des modifications (lecture réservée aux gestionnaires)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  table_name text not null,
  op         text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  row_key    text,
  old_data   jsonb,
  new_data   jsonb
);
create index if not exists audit_at_idx on public.audit_log (at desc);

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
         when 'planning_cells' then (coalesce(n, o)->>'day') || '/' || (coalesce(n, o)->>'group_code')
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

do $$
declare
  t text;
begin
  foreach t in array array['systems', 'tps', 'fiches', 'maintenance', 'maintenance_plans', 'purchases', 'rooms', 'tools',
                           'students', 'planning_cells', 'companies', 'pfmp_periods', 'sessions', 'timetable_slots'] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I for each row execute function public.audit()', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Sécurité (RLS)
-- ---------------------------------------------------------------------------
alter table public.maintenance_plans enable row level security;
alter table public.companies enable row level security;
alter table public.pfmp_periods enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists plans_read on public.maintenance_plans;
drop policy if exists plans_write on public.maintenance_plans;
create policy plans_read on public.maintenance_plans for select to authenticated using (public.is_active());
create policy plans_write on public.maintenance_plans for all to authenticated
  using (public.can_write()) with check (public.can_write());

drop policy if exists companies_read on public.companies;
drop policy if exists companies_write on public.companies;
create policy companies_read on public.companies for select to authenticated using (public.is_active());
create policy companies_write on public.companies for all to authenticated
  using (public.can_write()) with check (public.can_write());

drop policy if exists pfmp_read on public.pfmp_periods;
drop policy if exists pfmp_write on public.pfmp_periods;
create policy pfmp_read on public.pfmp_periods for select to authenticated using (public.is_active());
create policy pfmp_write on public.pfmp_periods for all to authenticated
  using (public.can_write()) with check (public.can_write());

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());

-- Les nouvelles tables héritent des droits par défaut de Supabase : on les resserre
revoke all on public.maintenance_plans, public.companies, public.pfmp_periods, public.audit_log from anon;
revoke all on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;
grant select, insert, update, delete on public.maintenance_plans, public.companies, public.pfmp_periods to authenticated;

-- Mises à jour en direct
do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['maintenance_plans', 'companies', 'pfmp_periods'] loop
      begin
        execute format('alter publication supabase_realtime add table public.%I', t);
      exception when duplicate_object then
        null;
      end;
    end loop;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Images (systèmes, outils, logos, photos de panne) : espace public, 5 Mo, images courantes sans SVG
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Stockage Supabase absent : étape ignorée.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('images', 'images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
  on conflict (id) do update
    set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists images_read on storage.objects;
  drop policy if exists images_insert on storage.objects;
  drop policy if exists images_delete on storage.objects;

  create policy images_read on storage.objects for select to anon, authenticated
    using (bucket_id = 'images');
  create policy images_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'images' and public.can_write());
  create policy images_delete on storage.objects for delete to authenticated
    using (bucket_id = 'images' and (public.is_admin() or (public.can_write() and owner_id = auth.uid()::text)));
end
$$;
