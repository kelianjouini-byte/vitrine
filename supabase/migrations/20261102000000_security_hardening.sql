-- Durcissement suite aux conseils de sécurité Supabase.
-- handle_new_user n'est appelée que par le déclencheur : personne ne doit l'appeler via l'API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- is_admin / my_business_id servent aux policies des utilisateurs connectés : on les retire aux visiteurs anonymes.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.my_business_id() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_business_id() to authenticated;
alter function public.touch_updated_at() set search_path = public;
