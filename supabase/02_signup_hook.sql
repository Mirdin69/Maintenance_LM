-- Activate this function under Authentication > Hooks > Before User Created.
-- It restricts account creation for the ENTIRE Supabase project.
-- Use a dedicated Supabase project for this application.
create or replace function public.lm_before_user_created(event jsonb) returns jsonb
language plpgsql set search_path='' as $$
begin
 if lower(split_part(coalesce(event->'user'->>'email',''),'@',2))<>'lamache.org'
 or coalesce(event->'user'->'app_metadata'->>'provider','')<>'google' then
  return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Utilisez votre compte Google @lamache.org.'));
 end if;
 return '{}'::jsonb;
end;
$$;
revoke all on function public.lm_before_user_created(jsonb) from public,anon,authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.lm_before_user_created(jsonb) to supabase_auth_admin;
