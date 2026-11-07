-- Données de départ (facultatif) : systèmes et TP déjà utilisés en MELEC.
-- À exécuter après 0001_init.sql. Les salles et le nombre de postes sont à compléter
-- dans l'application (onglets Salles et Systèmes).

insert into public.systems (name, ref, domain, qty, notes) values
  ('Capsuleuse Ravoux', '326-021', 'ind', 1, 'Fil rouge industriel. Salle et nombre de postes à compléter.'),
  ('Platine moteur triphasé à résistances', null, 'ind', 1, 'Démonstration du couplage étoile/triangle.'),
  ('Banc API M221 (EcoStruxure Machine Expert Basic)', null, 'ind', 1, 'Nombre de bancs à compléter.'),
  ('Banc Zelio (Zelio Soft 2)', null, 'ind', 1, 'Nombre de bancs à compléter.');

insert into public.tps (code, title, level, domain, hours, competences) values
  ('P1', 'Câblage avec fiches bananes sur platine à bornes repérées', 'Seconde', 'ind', null, '{C1,C4,C5,C11}'),
  ('P2', 'Câblage filaire réel en armoire', 'Seconde', 'ind', null, '{C1,C4,C5,C11}'),
  ('P3', 'Inversion du sens de rotation et verrouillage électrique', 'Seconde', 'ind', null, '{C1,C4,C5,C11}'),
  ('P4', 'Mesures et mise en service', 'Seconde', 'ind', null, '{C1,C4,C5,C11}'),
  ('P5', 'Capteurs TOR et initiation à l''automate', 'Seconde', 'ind', null, '{C1,C4,C5,C11}'),
  ('P6', 'Diagnostic de pannes', 'Seconde', 'ind', null, '{C1,C4,C5,C11}');

insert into public.tps (code, title, level, domain, hours, system_ids)
select 'TP5', 'Programmation de l''automate M221 (EcoStruxure Machine Expert Basic)', 'Première', 'ind', 5,
       array(select id from public.systems where name like 'Banc API M221%')
union all
select 'TP6', 'Programmation du relais Zelio (Zelio Soft 2)', 'Première', 'ind', 5,
       array(select id from public.systems where name like 'Banc Zelio%');
