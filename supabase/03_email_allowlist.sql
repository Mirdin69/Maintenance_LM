-- Run after 01_schema.sql and 02_signup_hook.sql. Keeps all existing records.
begin;
create table if not exists public.lm_allowed_teachers (
 email text primary key check(email=lower(btrim(email)) and split_part(email,'@',2)='lamache.org'),
 enabled boolean not null default true,
 created timestamptz not null default now()
);
alter table public.lm_allowed_teachers enable row level security;
revoke all on public.lm_allowed_teachers from public,anon,authenticated;
-- No API read/write policy: manage this private list from the SQL Editor only.
create or replace function public.lm_is_teacher() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.lm_allowed_teachers a on a.email=lower(u.email)
 where u.id=auth.uid() and u.email_confirmed_at is not null and a.enabled);
$$;
revoke all on function public.lm_is_teacher() from public,anon;
grant execute on function public.lm_is_teacher() to authenticated;
create or replace function public.lm_before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(event->'user'->'app_metadata'->>'provider','')<>'email'
 or not exists(select 1 from public.lm_allowed_teachers a where a.email=lower(event->'user'->>'email') and a.enabled) then
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Cette adresse n’est pas autorisée. Contactez le responsable de l’atelier.'));
 end if;
 return '{}'::jsonb;
end;
$$;
revoke all on function public.lm_before_user_created(jsonb) from public,anon,authenticated;
grant execute on function public.lm_before_user_created(jsonb) to supabase_auth_admin;

-- Authorized teachers can view and manage the list. It remains invisible to
-- anonymous visitors and to authenticated accounts outside the allowlist.
grant select on public.lm_allowed_teachers to authenticated;
drop policy if exists lm_teachers_read on public.lm_allowed_teachers;
create policy lm_teachers_read on public.lm_allowed_teachers for select to authenticated using ((select public.lm_is_teacher()));
create or replace function public.lm_manage_teacher(teacher_email text,remove_access boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare normalized text:=lower(btrim(teacher_email)); actor text;
begin
 -- Serializes removals, including attempts to delete the last authorized user.
 lock table public.lm_allowed_teachers in exclusive mode;
 if not public.lm_is_teacher() then raise exception 'Accès réservé aux enseignants autorisés.' using errcode='42501'; end if;
 if normalized is null or normalized !~ '^[^@\s]+@lamache\.org$' then raise exception 'Utilisez une adresse @lamache.org.'; end if;
 if remove_access then
  if exists(select 1 from public.lm_allowed_teachers where email=normalized and enabled)
   and (select count(*) from public.lm_allowed_teachers where enabled)<=1 then
   raise exception 'Le dernier enseignant autorisé ne peut pas être supprimé.';
  end if;
  delete from public.lm_allowed_teachers where email=normalized;
 else
  insert into public.lm_allowed_teachers(email,enabled) values(normalized,true)
   on conflict(email) do update set enabled=true;
 end if;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.lm_manage_teacher(text,boolean) from public,anon;
grant execute on function public.lm_manage_teacher(text,boolean) to authenticated;

grant usage on schema public to supabase_auth_admin;
commit;
