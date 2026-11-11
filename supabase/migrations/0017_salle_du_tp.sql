-- Salle conseillée d'un TP : utilisée dans le semainier quand la case n'a pas de salle propre.
alter table public.tps add column if not exists room_id uuid references public.rooms (id) on delete set null;
