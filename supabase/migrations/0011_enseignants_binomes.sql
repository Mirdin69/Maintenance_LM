-- Plusieurs enseignants par cours du semainier, et travail en binôme dans les TP.
alter table public.planning_cells
  add column if not exists teacher_ids uuid[] not null default '{}',
  add column if not exists teacher_labels text[] not null default '{}';
alter table public.planning_cells drop constraint if exists planning_cells_teachers_check;
alter table public.planning_cells add constraint planning_cells_teachers_check
  check (cardinality(teacher_ids) <= 6 and cardinality(teacher_labels) <= 6);

-- Taille des équipes : 1 = individuel, 2 = binôme, 3 = trinôme, 4 = quadrinôme
alter table public.tps
  add column if not exists pair_size smallint not null default 1 check (pair_size between 1 and 4);
