-- ===========================================================================
-- Parc MELEC, migration 0004 : dépôt direct de fichiers (Word, PDF, Excel…)
-- dans Supabase Storage, en plus des liens Drive. À exécuter APRÈS 0003.
-- ===========================================================================

-- Un document = { "title", "url" } (lien web) OU { "title", "path" } (fichier déposé sur le site)
create or replace function public.valid_documents(d jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(d) = 'array'
    and jsonb_array_length(d) <= 20
    and not exists (
      select 1 from jsonb_array_elements(d) e
      where jsonb_typeof(e) <> 'object'
         or char_length(coalesce(e->>'title', '')) > 120
         or not (
              (coalesce(e->>'url', '') ~* '^https?://' and char_length(e->>'url') <= 1000)
           or (coalesce(e->>'path', '') ~ '^docs/[A-Za-z0-9_-]{8,64}/[A-Za-z0-9._ ()-]{1,150}$'
               and e->>'path' not like '%..%')
         )
    )
$$;

-- Espace de stockage privé : 10 Mo par fichier, formats bureautiques et PDF seulement
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Stockage Supabase absent : étape ignorée.';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'documents', 'documents', false, 10485760,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation'
    ]
  )
  on conflict (id) do update
    set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  drop policy if exists documents_read on storage.objects;
  drop policy if exists documents_insert on storage.objects;
  drop policy if exists documents_delete on storage.objects;

  -- Lecture : comptes actifs. Dépôt : gestionnaires et enseignants. Suppression : gestionnaire ou auteur du dépôt.
  create policy documents_read on storage.objects for select to authenticated
    using (bucket_id = 'documents' and public.is_active());
  create policy documents_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'documents' and public.can_write());
  create policy documents_delete on storage.objects for delete to authenticated
    using (bucket_id = 'documents' and (public.is_admin() or (public.can_write() and owner_id = auth.uid()::text)));
end
$$;
