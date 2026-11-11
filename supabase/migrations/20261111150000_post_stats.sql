-- Statistiques des publications (likes, commentaires, vues, personnes touchées), lues chez Meta.
-- Une ligne par publication (post_publications) ; rafraîchie au plus toutes les 30 minutes par la fonction post-stats.
-- Lue et écrite UNIQUEMENT par le serveur (service role) : l'appli passe par la fonction.
create table public.post_stats (
  publication_id uuid primary key references public.post_publications (id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  platform public.social_platform not null,
  likes int,
  comments int,
  views int,
  reach int,
  fetched_at timestamptz not null default now()
);
create index on public.post_stats (business_id);

alter table public.post_stats enable row level security;
revoke all on public.post_stats from anon, authenticated;
