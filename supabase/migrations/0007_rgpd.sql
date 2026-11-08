-- RGPD : date de sortie des élèves, purge selon les durées de conservation, export et effacement d'un élève.
-- Les durées sont des réglages (retention_students_months, retention_audit_months ; 12 mois par défaut).

alter table public.students add column if not exists left_at date;

create or replace function public.retention_months(p_key text, p_default int)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(regexp_replace(value, '\D', '', 'g'), '')::int from public.settings where key = p_key), p_default)
$$;

-- Retire du journal des modifications toute trace d'un élève (son nom y figure dans les anciennes valeurs)
create or replace function public.scrub_student_audit(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.audit_log
  where (table_name = 'students' and coalesce(new_data, old_data)->>'id' = p_id::text)
     or (table_name = 'progress' and coalesce(new_data, old_data)->>'student_id' = p_id::text)
$$;
revoke all on function public.scrub_student_audit(uuid) from public, anon, authenticated;

create or replace function public.purge_preview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ms int := public.retention_months('retention_students_months', 12); ma int := public.retention_months('retention_audit_months', 12);
begin
  if not public.is_admin() then raise exception 'Réservé aux gestionnaires'; end if;
  return jsonb_build_object(
    'students', (select count(*) from public.students where left_at is not null and left_at < current_date - make_interval(months => ms)),
    'audit', (select count(*) from public.audit_log where at < now() - make_interval(months => ma)),
    'students_months', ms, 'audit_months', ma);
end $$;

create or replace function public.purge_expired()
returns jsonb language plpgsql security definer set search_path = public as $$
declare ms int := public.retention_months('retention_students_months', 12); ma int := public.retention_months('retention_audit_months', 12);
  ids uuid[]; i uuid; n_audit int;
begin
  if not public.is_admin() then raise exception 'Réservé aux gestionnaires'; end if;
  select coalesce(array_agg(id), '{}') into ids from public.students where left_at is not null and left_at < current_date - make_interval(months => ms);
  delete from public.students where id = any (ids);
  foreach i in array ids loop perform public.scrub_student_audit(i); end loop;
  delete from public.audit_log where at < now() - make_interval(months => ma);
  get diagnostics n_audit = row_count;
  return jsonb_build_object('students', coalesce(array_length(ids, 1), 0), 'audit', n_audit);
end $$;

-- Droit d'accès : toutes les données enregistrées pour un élève
create or replace function public.export_student(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux gestionnaires'; end if;
  return (select jsonb_build_object(
    'eleve', to_jsonb(s),
    'competences', coalesce((select jsonb_agg(jsonb_build_object('tp', t.code, 'titre', t.title, 'niveau', p.level, 'modifie_le', p.updated_at))
                             from public.progress p join public.tps t on t.id = p.tp_id where p.student_id = s.id), '[]'::jsonb),
    'exporte_le', now())
    from public.students s where s.id = p_id);
end $$;

-- Droit à l'effacement : supprime l'élève, sa progression et ses traces dans le journal
create or replace function public.erase_student(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Réservé aux gestionnaires'; end if;
  delete from public.students where id = p_id;
  perform public.scrub_student_audit(p_id);
end $$;

revoke all on function public.purge_preview(), public.purge_expired(), public.export_student(uuid), public.erase_student(uuid), public.retention_months(text, int) from public, anon;
grant execute on function public.purge_preview(), public.purge_expired(), public.export_student(uuid), public.erase_student(uuid) to authenticated;
