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

-- Petits secrets internes tirés au hasard dans la base (jamais dans Git, jamais lisibles par l'appli).
create table if not exists public.app_secrets (
  name text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
insert into public.app_secrets (name, value)
  values ('trial_emails_cron', encode(extensions.gen_random_bytes(24), 'hex'))
  on conflict (name) do nothing;

-- Lancement quotidien à 9 h UTC (10 h à Paris en hiver). Le mot de passe est relu dans app_secrets à chaque fois.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('vitrine-trial-emails') where exists (select 1 from cron.job where jobname = 'vitrine-trial-emails');
select cron.schedule('vitrine-trial-emails', '0 9 * * *', $$
  select net.http_post(
    url := 'https://fcnkaomxrmcprqrmpycu.supabase.co/functions/v1/trial-emails',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where name = 'trial_emails_cron')),
    body := '{}'::jsonb)
$$);
