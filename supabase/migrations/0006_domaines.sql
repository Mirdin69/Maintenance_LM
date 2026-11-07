-- Domaines personnalisés : la liste est enregistrée dans les réglages (clé custom_domains) ;
-- les TP et les systèmes peuvent donc porter un identifiant de domaine libre (ex. « c-froid »).
-- Corrige aussi les systèmes, dont la contrainte n'acceptait que 4 domaines.
alter table public.tps drop constraint if exists tps_domain_check;
alter table public.tps add constraint tps_domain_check check (domain ~ '^[a-z][a-z0-9-]{1,19}$');
alter table public.systems drop constraint if exists systems_domain_check;
alter table public.systems add constraint systems_domain_check check (domain ~ '^[a-z][a-z0-9-]{1,19}$');
