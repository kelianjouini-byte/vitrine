-- Bouton « Renvoyer l'e-mail » des applis App Store / Google Play (27 nov. 2026).
-- Une ligne par e-mail renvoyé : sert seulement à limiter à 3 renvois par heure et par boutique.
-- Lue et écrite UNIQUEMENT par le serveur (fonction trial-emails).
create table if not exists public.trial_email_resends (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists trial_email_resends_business_idx on public.trial_email_resends (business_id, created_at desc);
alter table public.trial_email_resends enable row level security;
revoke all on public.trial_email_resends from anon, authenticated;
