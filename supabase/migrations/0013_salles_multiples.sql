-- Un cours du semainier peut se dérouler dans plusieurs salles (rotations en atelier) :
-- room_id reste la salle principale, extra_room_ids les salles supplémentaires.
alter table public.planning_cells
  add column if not exists extra_room_ids uuid[] not null default '{}';
alter table public.planning_cells drop constraint if exists planning_cells_extra_rooms_check;
alter table public.planning_cells add constraint planning_cells_extra_rooms_check check (cardinality(extra_room_ids) <= 3);
