-- « Mon bilan » : conseils du mois écrits par l'IA (historique, cache et limite d'usage).
-- Ajout uniquement : aucune donnée existante n'est modifiée ni supprimée.
-- Les chiffres du bilan (posts publiés) sont calculés à partir des posts : ils ne sont pas stockés ici,
-- sauf pour savoir si le conseil déjà écrit correspond toujours aux mêmes chiffres.
create table if not exists public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  posts_count integer not null check (posts_count >= 0),
  previous_count integer not null check (previous_count >= 0),
  advice text not null check (char_length(advice) between 1 and 400),
  prompt_version text,
  created_at timestamptz not null default now()
);
create index if not exists monthly_reports_business_month on public.monthly_reports (business_id, month, created_at desc);
create index if not exists monthly_reports_business_time on public.monthly_reports (business_id, created_at desc);
alter table public.monthly_reports enable row level security;
-- Lecture seule pour le commerçant ; seul le serveur écrit.
create policy "mes bilans - lire" on public.monthly_reports for select using (business_id = public.my_business_id());
