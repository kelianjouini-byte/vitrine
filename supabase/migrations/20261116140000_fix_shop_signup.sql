-- Correctif (16 nov. 2026) : l'inscription d'une NOUVELLE boutique échouait (« Votre boutique n'a pas pu être enregistrée »).
-- La règle « créer ma boutique » lisait directement team_members, que les comptes n'ont pas le droit de lire
-- (permission denied for table team_members). On passe par une fonction sûre, comme les autres règles.
create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where user_id = auth.uid());
$$;
revoke execute on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;

drop policy if exists "ma boutique - créer" on public.businesses;
create policy "ma boutique - créer" on public.businesses for insert
  with check (owner_id = auth.uid() and main_business_id is null and not public.is_team_member());
