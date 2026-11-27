-- Espace employé : points de l'équipe, objectif commun, mot du patron. Décisions de Kelian (23 nov. 2026) :
--  - +10 points quand un employé envoie un post au patron (3 envois comptés par jour au plus), +50 quand il est publié ;
--  - un seul objectif pour TOUTE l'équipe, sans date ; pas de classement entre employés ;
--  - le patron écrit un petit mot affiché sur l'accueil de ses employés.
-- Ajouts uniquement : aucune donnée existante n'est modifiée ni supprimée.
-- Écrites et lues uniquement par le serveur (Edge Function « team ») : RLS active, sans règle pour l'appli.

create table if not exists public.team_points (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  reason text not null check (reason in ('sent', 'published')),
  points int not null check (points between 0 and 1000),
  created_at timestamptz not null default now()
);
-- Un même post ne rapporte qu'une fois chaque type de points (un renvoi après refus ne compte pas deux fois).
create unique index if not exists team_points_once on public.team_points (post_id, reason) where post_id is not null;
create index if not exists team_points_company_time on public.team_points (company_id, created_at desc);
create index if not exists team_points_user_time on public.team_points (user_id, created_at desc);
alter table public.team_points enable row level security;
revoke all on public.team_points from anon, authenticated;

create table if not exists public.team_goals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.businesses (id) on delete cascade,
  points int not null check (points between 100 and 20000),
  reward text not null check (char_length(reward) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  reached_at timestamptz,
  -- Arrêté par le patron (remplacé par un autre objectif, ou supprimé).
  stopped_at timestamptz
);
-- Un seul objectif en cours par entreprise.
create unique index if not exists team_goals_one_active on public.team_goals (company_id) where stopped_at is null;
alter table public.team_goals enable row level security;
revoke all on public.team_goals from anon, authenticated;

create table if not exists public.team_settings (
  company_id uuid primary key references public.businesses (id) on delete cascade,
  note text check (char_length(note) <= 160),
  note_by uuid references auth.users (id) on delete set null,
  note_at timestamptz
);
alter table public.team_settings enable row level security;
revoke all on public.team_settings from anon, authenticated;
