-- E-mails de fin d'essai (rappel avant la fin + « essai terminé »), envoyés par la fonction trial-emails.
-- Une ligne par boutique et par type d'e-mail : c'est ce qui empêche tout doublon.
-- Lue et écrite UNIQUEMENT par le serveur (service role).
create table if not exists public.trial_emails (
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null check (kind in ('reminder', 'ended')),
  email text not null,
  sent_at timestamptz not null default now(),
  primary key (business_id, kind)
);
alter table public.trial_emails enable row level security;
revoke all on public.trial_emails from anon, authenticated;

-- Lancement quotidien (10 h, heure de Paris en hiver = 9 h UTC) : à faire UNE fois, avec le vrai secret,
-- dans Dashboard > SQL Editor (le secret n'est jamais écrit dans Git) :
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--   select cron.schedule('vitrine-trial-emails', '0 9 * * *', $$
--     select net.http_post(
--       url := 'https://<projet>.supabase.co/functions/v1/trial-emails',
--       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
--       body := '{}'::jsonb)
--   $$);
