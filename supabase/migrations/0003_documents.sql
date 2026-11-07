-- ===========================================================================
-- Parc MELEC, migration 0003 : documents joints (Word, PDF, Excel) aux TP et
-- aux fiches, et lien d'une fiche séance vers sa fiche séquence.
-- À exécuter APRÈS 0002_semainier.sql.
-- ===========================================================================

-- Un document = { "title": "...", "url": "https://..." } (lien d'un fichier du Drive partagé)
create or replace function public.valid_documents(d jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(d) = 'array'
    and jsonb_array_length(d) <= 20
    and not exists (
      select 1 from jsonb_array_elements(d) e
      where jsonb_typeof(e) <> 'object'
         or coalesce(e->>'url', '') !~* '^https?://'
         or char_length(e->>'url') > 1000
         or char_length(coalesce(e->>'title', '')) > 120
    )
$$;

alter table public.tps add column if not exists documents jsonb not null default '[]'::jsonb;
alter table public.tps drop constraint if exists tps_documents_check;
alter table public.tps add constraint tps_documents_check check (public.valid_documents(documents));

alter table public.fiches add column if not exists documents jsonb not null default '[]'::jsonb;
alter table public.fiches drop constraint if exists fiches_documents_check;
alter table public.fiches add constraint fiches_documents_check check (public.valid_documents(documents));

-- Une fiche séance se rattache à une fiche séquence (supprimée : le lien disparaît, la séance reste)
alter table public.fiches add column if not exists sequence_id uuid references public.fiches (id) on delete set null;

create or replace function public.check_fiche_sequence()
returns trigger language plpgsql as $$
begin
  if new.sequence_id is not null then
    if new.kind <> 'seance' then
      raise exception 'Seule une fiche séance peut être rattachée à une séquence.' using errcode = '23514';
    end if;
    if not exists (select 1 from public.fiches s where s.id = new.sequence_id and s.kind = 'sequence') then
      raise exception 'La fiche rattachée doit être une fiche séquence.' using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
drop trigger if exists fiches_check_sequence on public.fiches;
create trigger fiches_check_sequence before insert or update of sequence_id, kind on public.fiches
  for each row execute function public.check_fiche_sequence();

revoke all on all tables in schema public from anon;
grant select on public.settings to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke execute on function public.valid_documents(jsonb) from anon;
