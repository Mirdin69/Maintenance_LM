-- Supprimer un TP utilisé dans le semainier : la case qui n'avait que ce TP (ni activité libre, ni note) est supprimée.
-- Sans cela, la contrainte « une case contient un TP, une activité ou une note » bloquait la suppression du TP.
create or replace function public.tp_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.planning_cells where tp_id = old.id and label is null and note is null;
  return old;
end
$$;
revoke all on function public.tp_before_delete() from public, anon, authenticated;
drop trigger if exists tps_before_delete on public.tps;
create trigger tps_before_delete before delete on public.tps for each row execute function public.tp_before_delete();
