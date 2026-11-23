-- E-mails de fin d'essai gratuit (23 nov. 2026).
-- Garde la trace de chaque e-mail envoyé : le rappel 3 jours avant la fin et l'e-mail de fin ne partent qu'une fois,
-- et le bouton « Renvoyer l'e-mail » de l'appli est limité à 3 envois par heure.
-- Table lue et écrite UNIQUEMENT par le serveur (fonction trial-emails) : aucun accès pour l'appli.
create table if not exists public.trial_emails (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('soon', 'ended', 'resend')),
  created_at timestamptz not null default now()
);
create index if not exists trial_emails_business_idx on public.trial_emails (business_id, created_at desc);

alter table public.trial_emails enable row level security;
revoke all on public.trial_emails from anon, authenticated;
