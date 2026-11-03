-- Assistant d'idées de posts + carte d'identité de la boutique.
-- Ajouts uniquement : aucune donnée existante n'est modifiée ni supprimée.

-- Carte d'identité : ce qui rend la boutique unique (« fait maison », « bio », « 3e génération »...).
-- Les produits utilisent la colonne existante « specialties », la clientèle « audience ».
alter table public.businesses
  add column if not exists strengths text check (char_length(strengths) <= 500);

-- Idées proposées par l'IA (historique + limite d'usage). Écrites par le serveur uniquement.
create table if not exists public.post_ideas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  ideas jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists post_ideas_business_time on public.post_ideas (business_id, created_at desc);
alter table public.post_ideas enable row level security;
create policy "mes idées - lire" on public.post_ideas for select using (business_id = public.my_business_id());

-- 👍 / 👎 du commerçant sur une idée : l'assistant s'en sert pour s'adapter.
create table if not exists public.post_idea_feedback (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  idea_title text not null check (char_length(idea_title) between 1 and 160),
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now()
);
create index if not exists post_idea_feedback_business_time on public.post_idea_feedback (business_id, created_at desc);
alter table public.post_idea_feedback enable row level security;
create policy "mes avis - lire" on public.post_idea_feedback for select using (business_id = public.my_business_id());
create policy "mes avis - donner" on public.post_idea_feedback for insert with check (business_id = public.my_business_id());
