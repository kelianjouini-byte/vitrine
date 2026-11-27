-- « Le petit rappel du jour » : une notification par jour d'ouverture pour donner envie de publier.
-- Une ligne par téléphone (ou navigateur) qui a accepté les notifications.
-- Lue et écrite UNIQUEMENT par le serveur (fonctions push-subscribe et daily-nudge, service role).
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null default 'web' check (kind in ('web')),
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  enabled boolean not null default true,
  -- Heure choisie pour le rappel (heure de Paris) et jours de fermeture de la boutique.
  hour smallint not null default 10 check (hour between 6 and 21),
  closed_days smallint[] not null default '{}',
  closed_dates date[] not null default '{}',
  -- Prochaines occasions du métier (nom + date), envoyées par l'appli : pour « Noël dans 3 jours ».
  occasions jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_business on public.push_subscriptions (business_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Une ligne par rappel envoyé : jamais deux le même jour, et pas le même texte trop souvent.
create table if not exists public.daily_nudges (
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  day date not null,
  text_id text not null,
  status text not null default 'sent',
  sent_at timestamptz not null default now(),
  primary key (subscription_id, day)
);
alter table public.daily_nudges enable row level security;
revoke all on public.daily_nudges from anon, authenticated;

-- Mot de passe de la tâche planifiée (tiré au hasard, jamais dans Git).
insert into public.app_secrets (name, value)
  values ('daily_nudge_cron', encode(extensions.gen_random_bytes(24), 'hex'))
  on conflict (name) do nothing;

-- Toutes les heures, 5 minutes après l'heure pile : la fonction envoie à chaque boutique ouverte ce jour-là
-- dont c'est l'heure du rappel (heure de Paris).
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('vitrine-daily-nudge') where exists (select 1 from cron.job where jobname = 'vitrine-daily-nudge');
select cron.schedule('vitrine-daily-nudge', '5 * * * *', $$
  select net.http_post(
    url := 'https://fcnkaomxrmcprqrmpycu.supabase.co/functions/v1/daily-nudge',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where name = 'daily_nudge_cron')),
    body := '{}'::jsonb)
$$);
