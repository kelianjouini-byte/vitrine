-- Plusieurs boutiques + équipe (patrons et employés). Décisions de Kelian, 9 nov. 2026 :
--  - une « entreprise » = la boutique principale (celle créée à l'inscription) + ses boutiques ajoutées ;
--  - 2 rôles : patron (tout, comme le créateur du compte) et employé (prépare les posts, un patron valide) ;
--  - un employé peut être autorisé à « publier seul » par un patron ;
--  - l'employé se connecte avec son e-mail + un code de 6 caractères donné par le patron ;
--  - prix : 1re boutique 39 € (mensuel) / 29 € (annuel), chaque boutique en plus 19 € / 15 €, employés gratuits.
-- Ajouts uniquement : aucune donnée existante n'est supprimée. Les boutiques existantes restent des boutiques principales.

-- ---------- Boutiques ajoutées ---------------------------------------------
-- Une boutique ajoutée n'a pas de propriétaire direct (owner_id vide) : elle appartient à la boutique principale.
-- La contrainte « 1 boutique principale par compte » (owner_id unique) est gardée.
alter table public.businesses alter column owner_id drop not null;
alter table public.businesses
  add column if not exists main_business_id uuid references public.businesses (id) on delete cascade;
alter table public.businesses drop constraint if exists businesses_owner_or_main;
alter table public.businesses add constraint businesses_owner_or_main
  check ((owner_id is not null and main_business_id is null) or (owner_id is null and main_business_id is not null));
create index if not exists businesses_main_idx on public.businesses (main_business_id);

-- Prix d'une boutique en plus, par offre.
alter table public.plans add column if not exists extra_shop_price_cents int not null default 0;
update public.plans set extra_shop_price_cents = 1900 where id = 'monthly';
update public.plans set extra_shop_price_cents = 1500 where id = 'annual';

-- ---------- Équipe -----------------------------------------------------------
-- Le créateur du compte n'est pas dans cette table : il est le patron principal (celui qui paie).
-- Écrite et lue uniquement par le serveur (Edge Function « team ») : RLS sans règle pour l'appli.
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.businesses (id) on delete cascade,
  -- Un compte Vitrine n'appartient qu'à une seule équipe.
  user_id uuid not null unique references auth.users (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 60),
  email text not null check (char_length(email) between 3 and 200),
  role text not null check (role in ('patron', 'employe')),
  -- Boutiques de l'employé ; vide = toutes les boutiques.
  shop_ids uuid[] not null default '{}',
  -- « Publie seul » : décidé par un patron, éteint au départ.
  can_publish boolean not null default false,
  -- Code de connexion (6 caractères), chiffré : le patron peut le relire s'il l'a perdu.
  encrypted_code text not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists team_members_company_email on public.team_members (company_id, lower(email));
create index if not exists team_members_email on public.team_members (lower(email));
create trigger t_team before update on public.team_members for each row execute function public.touch_updated_at();
alter table public.team_members enable row level security;
revoke all on public.team_members from anon, authenticated;

-- Essais de connexion avec un code (blocage après plusieurs erreurs).
create table if not exists public.team_login_attempts (
  id bigint generated always as identity primary key,
  email text not null,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists team_login_attempts_email_time on public.team_login_attempts (lower(email), created_at desc);
alter table public.team_login_attempts enable row level security;
revoke all on public.team_login_attempts from anon, authenticated;

-- ---------- Posts : validation par un patron ---------------------------------
-- review_state : null (pas concerné) · pending (envoyé au patron) · approved · rejected.
alter table public.posts
  add column if not exists created_by uuid references auth.users (id) on delete set null,
  add column if not exists review_state text check (review_state in ('pending', 'approved', 'rejected')),
  add column if not exists review_note text check (char_length(review_note) <= 300),
  add column if not exists reviewed_by uuid references auth.users (id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists platforms text[] not null default '{}',
  add column if not exists idempotency_key text;
create index if not exists posts_review_pending on public.posts (business_id, submitted_at desc) where review_state = 'pending';

-- ---------- Qui a accès à quoi ------------------------------------------------
-- Entreprise de l'utilisateur connecté : sa boutique principale, ou celle de son équipe.
create or replace function public.my_company_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.businesses where owner_id = auth.uid() and main_business_id is null),
    (select company_id from public.team_members where user_id = auth.uid())
  );
$$;

-- L'utilisateur connecté peut-il voir cette boutique ? (propriétaire, patron, ou employé de cette boutique)
create or replace function public.can_access_business(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.businesses b
    where b.id = bid and coalesce(b.main_business_id, b.id) = public.my_company_id()
      and (
        exists (select 1 from public.businesses m where m.id = coalesce(b.main_business_id, b.id) and m.owner_id = auth.uid())
        or exists (
          select 1 from public.team_members t
          where t.user_id = auth.uid() and (t.role = 'patron' or cardinality(t.shop_ids) = 0 or b.id = any (t.shop_ids))
        )
      )
  );
$$;

-- L'utilisateur connecté est-il patron de l'entreprise de cette boutique ?
create or replace function public.is_patron_of(bid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.businesses b
    where b.id = bid and coalesce(b.main_business_id, b.id) = public.my_company_id()
      and (
        exists (select 1 from public.businesses m where m.id = coalesce(b.main_business_id, b.id) and m.owner_id = auth.uid())
        or exists (select 1 from public.team_members t where t.user_id = auth.uid() and t.role = 'patron')
      )
  );
$$;

-- Comptes de la même entreprise (pour lire les photos des collègues : dossier = id du compte).
create or replace function public.company_user_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select owner_id::text from public.businesses where id = public.my_company_id() and owner_id is not null
  union
  select user_id::text from public.team_members where company_id = public.my_company_id();
$$;

revoke execute on function public.my_company_id() from public, anon;
revoke execute on function public.can_access_business(uuid) from public, anon;
revoke execute on function public.is_patron_of(uuid) from public, anon;
revoke execute on function public.company_user_ids() from public, anon;
grant execute on function public.my_company_id() to authenticated;
grant execute on function public.can_access_business(uuid) to authenticated;
grant execute on function public.is_patron_of(uuid) to authenticated;
grant execute on function public.company_user_ids() to authenticated;

-- ---------- Règles de lecture mises à jour (même sens qu'avant, étendu à l'équipe) ----
drop policy if exists "ma boutique - lire" on public.businesses;
-- Un membre d'équipe ne crée pas de boutique à lui (il travaille dans celles de son patron).
drop policy if exists "ma boutique - créer" on public.businesses;
create policy "ma boutique - créer" on public.businesses for insert
  with check (owner_id = auth.uid() and main_business_id is null
    and not exists (select 1 from public.team_members t where t.user_id = auth.uid()));
drop policy if exists "ma boutique - modifier" on public.businesses;
create policy "ma boutique - lire" on public.businesses for select
  using (owner_id = auth.uid() or public.can_access_business(id) or public.is_admin());
-- Modifier la fiche d'une boutique : son propriétaire ou un patron (jamais un employé).
create policy "ma boutique - modifier" on public.businesses for update
  using (owner_id = auth.uid() or public.is_patron_of(id))
  with check (
    (owner_id = auth.uid() and main_business_id is null)
    or (owner_id is null and public.is_patron_of(id))
  );

-- Depuis l'appli, on ne change jamais à qui appartient une boutique (seul le serveur le peut).
create or replace function public.businesses_keep_owner() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.owner_id is distinct from old.owner_id or new.main_business_id is distinct from old.main_business_id) then
    raise exception 'owner_change_forbidden';
  end if;
  return new;
end $$;
drop trigger if exists businesses_keep_owner on public.businesses;
create trigger businesses_keep_owner before update on public.businesses
  for each row execute function public.businesses_keep_owner();

drop policy if exists "mes réseaux - lire" on public.social_accounts;
create policy "mes réseaux - lire" on public.social_accounts for select using (public.can_access_business(business_id));

drop policy if exists "mes posts" on public.posts;
create policy "mes posts" on public.posts for select using (public.can_access_business(business_id));
drop policy if exists "mes publications" on public.post_publications;
create policy "mes publications" on public.post_publications for select
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_access_business(p.business_id)));
drop policy if exists "mon journal" on public.post_events;
create policy "mon journal" on public.post_events for select
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_access_business(p.business_id)));

drop policy if exists "mes campagnes" on public.event_campaigns;
create policy "mes campagnes" on public.event_campaigns for all
  using (public.is_patron_of(business_id)) with check (public.is_patron_of(business_id));
drop policy if exists "mes notifications" on public.notifications;
create policy "mes notifications" on public.notifications for select using (public.can_access_business(business_id));
drop policy if exists "mes réglages notif" on public.notification_settings;
create policy "mes réglages notif" on public.notification_settings for all
  using (public.is_patron_of(business_id)) with check (public.is_patron_of(business_id));
-- L'abonnement : seulement les patrons.
drop policy if exists "mon abonnement" on public.subscriptions;
create policy "mon abonnement" on public.subscriptions for select using (public.is_patron_of(business_id));
drop policy if exists "mes générations" on public.ai_generations;
create policy "mes générations" on public.ai_generations for select using (public.can_access_business(business_id));
drop policy if exists "mes idées - lire" on public.post_ideas;
create policy "mes idées - lire" on public.post_ideas for select using (public.can_access_business(business_id));
drop policy if exists "mes avis - lire" on public.post_idea_feedback;
drop policy if exists "mes avis - donner" on public.post_idea_feedback;
create policy "mes avis - lire" on public.post_idea_feedback for select using (public.can_access_business(business_id));
create policy "mes avis - donner" on public.post_idea_feedback for insert with check (public.can_access_business(business_id));
drop policy if exists "mes bilans - lire" on public.monthly_reports;
create policy "mes bilans - lire" on public.monthly_reports for select using (public.can_access_business(business_id));

-- Photos : chacun envoie dans SON dossier (inchangé) ; on peut lire celles de son équipe
-- (le patron voit la photo du post préparé par son employé).
drop policy if exists "photos - lire mon dossier" on storage.objects;
create policy "photos - lire mon dossier" on storage.objects for select to authenticated
  using (bucket_id = 'post-images' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (storage.foldername(name))[1] in (select public.company_user_ids())
  ));
