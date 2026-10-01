-- Run once in the Supabase SQL Editor. No example data is inserted.
begin;
create table public.lm_systems (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 1 and 150),
 workshop text not null check(workshop in ('MELEC','CIEL','MECA','SM - TCI - OBM','BOIS - ERA - TMA')),
 location text not null default '' check(length(location)<=150),
 status text not null default 'Disponible' check(status in ('Disponible','En maintenance','Hors service','Archivé')),
 notes text not null default '' check(length(notes)<=4000), created timestamptz not null default now()
);
create table public.lm_records (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('maintenance','achats','planning')),
 system_id uuid references public.lm_systems(id) on delete restrict,
 title text not null check(length(btrim(title)) between 1 and 200), status text not null,
 data jsonb not null default '{}' check(jsonb_typeof(data)='object' and octet_length(data::text)<20000),
 author text not null, created timestamptz not null default now(),
 check((kind='maintenance' and status in ('À traiter','En cours','Terminée') and system_id is not null)
 or (kind='achats' and status in ('À valider','Validée','Commandée','Reçue','Refusée'))
 or (kind='planning' and status='Réservé' and system_id is not null))
);
create index lm_records_kind_idx on public.lm_records(kind);
create index lm_records_system_idx on public.lm_records(system_id);
create table public.lm_history (
 id uuid primary key default gen_random_uuid(), record_id uuid not null references public.lm_records(id) on delete cascade,
 status text not null, notes text not null, author text not null, snapshot jsonb not null,
 created timestamptz not null default now()
);
create index lm_history_record_idx on public.lm_history(record_id);

-- The email and Google identity are read from Supabase's server-managed account.
-- Client-supplied user_metadata is never used to grant access.
create function public.lm_is_teacher() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=auth.uid()
 and lower(split_part(u.email,'@',2))='lamache.org' and u.email_confirmed_at is not null
 and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'));
$$;
revoke all on function public.lm_is_teacher() from public,anon;
grant execute on function public.lm_is_teacher() to authenticated;
alter table public.lm_systems enable row level security;
alter table public.lm_records enable row level security;
alter table public.lm_history enable row level security;
revoke all on public.lm_systems,public.lm_records,public.lm_history from anon,authenticated;
grant select on public.lm_systems,public.lm_records,public.lm_history to authenticated;
create policy lm_systems_read on public.lm_systems for select to authenticated using ((select public.lm_is_teacher()));
create policy lm_records_read on public.lm_records for select to authenticated using ((select public.lm_is_teacher()));
create policy lm_history_read on public.lm_history for select to authenticated using ((select public.lm_is_teacher()));

-- All writes pass through this transaction. A row lock serializes bookings and
-- changes to the availability of the same system, even from multiple browsers.
create function public.lm_mutate(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 action text:=payload->>'action'; rid uuid:=coalesce(nullif(payload->>'id','')::uuid,gen_random_uuid());
 sid uuid:=nullif(payload->>'systemId','')::uuid; k text:=payload->>'kind';
 d jsonb:=coalesce(payload->'data','{}'::jsonb); st text:=payload->>'status';
 t text:=btrim(payload->>'title'); actor text; sys_status text; existing_kind text; existing_sid uuid;
 start_at timestamp; end_at timestamp; school_start integer; qty numeric; price numeric;
begin
 if not public.lm_is_teacher() then raise exception 'Accès réservé aux comptes Google @lamache.org.' using errcode='42501'; end if;
 select email into actor from auth.users where id=auth.uid();
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>30000 then raise exception 'Données invalides.'; end if;
 if action='system' then
  -- Lock an existing row before changing status; new systems have no reservations.
  if nullif(payload->>'id','') is not null then
   perform 1 from public.lm_systems where id=rid for update;
   if not found then raise exception 'Système introuvable.'; end if;
  end if;
  insert into public.lm_systems(id,name,workshop,location,status,notes)
   values(rid,btrim(payload->>'name'),payload->>'workshop',coalesce(payload->>'location',''),st,coalesce(payload->>'notes',''))
   on conflict(id) do update set name=excluded.name,workshop=excluded.workshop,location=excluded.location,status=excluded.status,notes=excluded.notes;
 elsif action='deleteSystem' then
  perform 1 from public.lm_systems where id=rid for update;
  if not found then raise exception 'Système introuvable.'; end if;
  if exists(select 1 from public.lm_records where system_id=rid) then
   raise exception 'Ce système est lié à un historique ou à un TP. Archivez-le pour conserver ces informations.';
  end if;
  delete from public.lm_systems where id=rid;
 elsif action='record' then
  if k is null or k not in ('maintenance','achats','planning') or t is null or length(t)=0 then raise exception 'Vérifiez le titre et le type.'; end if;
  if jsonb_typeof(d)<>'object' or length(coalesce(d->>'notes',''))>4000 then raise exception 'Remarques invalides.'; end if;
  -- System references on a record cannot be moved to another system once created.
  if nullif(payload->>'id','') is not null then
   select kind,system_id into existing_kind,existing_sid from public.lm_records where id=rid for update;
   if not found or existing_kind<>k or existing_sid is distinct from sid then
    raise exception 'Enregistrement introuvable ou système modifié. Créez un nouvel enregistrement pour changer de système.';
   end if;
  end if;
  if sid is not null then
   select status into sys_status from public.lm_systems where id=sid for update;
   if not found then raise exception 'Système introuvable.'; end if;
  end if;
  if k='achats' then
   qty:=(d->>'quantity')::numeric; price:=(d->>'price')::numeric;
   if qty is null or qty<=0 or qty<>trunc(qty) or price is null or price<0 or qty>100000 or price>10000000
   or coalesce(d->>'category','') not in ('Matériel','Consommable')
   or coalesce(d->>'workshop','') not in ('MELEC','CIEL','MECA','SM - TCI - OBM','BOIS - ERA - TMA') then
    raise exception 'Quantité, prix, atelier ou type invalide.';
   end if;
  elsif k='planning' then
   if sid is null or sys_status<>'Disponible' then raise exception 'Ce système n’est pas disponible.'; end if;
   if coalesce(d->>'start','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
    or coalesce(d->>'end','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$'
    or coalesce(d->>'year','') !~ '^\d{4}-\d{4}$' or length(btrim(coalesce(d->>'group','')))=0 then
     raise exception 'Renseignez les dates, l’année scolaire et le groupe.';
   end if;
   start_at:=(d->>'start')::timestamp; end_at:=(d->>'end')::timestamp;
   school_start:=split_part(d->>'year','-',1)::integer;
   if school_start<2000 or school_start>2200 or split_part(d->>'year','-',2)::integer<>school_start+1
    or end_at<=start_at or start_at<make_date(school_start,9,1)::timestamp
    or end_at>make_date(school_start+1,9,1)::timestamp then raise exception 'Vérifiez les dates et l’année scolaire (septembre à août).'; end if;
   if exists(select 1 from public.lm_records r where r.kind='planning' and r.system_id=sid and r.id<>rid
    and (r.data->>'start')::timestamp<end_at and (r.data->>'end')::timestamp>start_at) then
    raise exception 'Ce créneau est déjà réservé pour ce système.';
   end if;
  elsif k='maintenance' then
   if sid is null or coalesce(d->>'priority','') not in ('Normale','Haute','Basse') then raise exception 'Choisissez un système et une priorité.'; end if;
   if coalesce(d->>'date','')<>'' then perform (d->>'date')::date; end if;
  end if;
  insert into public.lm_records(id,kind,system_id,title,status,data,author)
   values(rid,k,sid,t,st,d,actor)
   on conflict(id) do update set title=excluded.title,status=excluded.status,data=excluded.data;
  insert into public.lm_history(record_id,status,notes,author,snapshot) values(rid,st,coalesce(d->>'notes',''),actor,payload);
 elsif action='deleteRecord' then
  delete from public.lm_records where id=rid and kind='planning';
  if not found then raise exception 'Réservation introuvable.'; end if;
 else raise exception 'Action inconnue.';
 end if;
 return jsonb_build_object('ok',true,'id',rid);
end;
$$;
revoke all on function public.lm_mutate(jsonb) from public,anon;
grant execute on function public.lm_mutate(jsonb) to authenticated;
commit;
