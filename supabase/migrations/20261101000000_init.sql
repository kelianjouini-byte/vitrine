-- =====================================================================
-- VITRINE — schéma initial (Phase 1 MVP + tables prêtes pour la Phase 2)
-- Toutes les tables ont la Row Level Security activée.
-- Un commerçant ne voit QUE les données de son commerce.
-- Les jetons Meta ne sont JAMAIS lisibles depuis l'application.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Types --------------------------------------------------------
create type public.user_role as enum ('merchant', 'admin');
create type public.social_platform as enum ('instagram', 'facebook');
create type public.connection_status as enum ('connected', 'disconnected', 'expired');
create type public.post_status as enum (
  'draft', 'generating', 'awaiting_approval', 'scheduled', 'publishing',
  'published', 'partially_published', 'failed', 'cancelled');
create type public.publication_status as enum ('pending', 'publishing', 'published', 'failed');
create type public.campaign_mode as enum ('assisted', 'semi_auto', 'auto');
create type public.approval_status as enum ('pending', 'approved', 'revoked');

-- ---------- users (profil lié à auth.users) -------------------------------
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role public.user_role not null default 'merchant',
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
$$;

-- ---------- businesses ----------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.users (id) on delete cascade, -- 1 boutique / compte (multi-boutiques en phase 3)
  owner_first_name text not null check (char_length(owner_first_name) between 1 and 60),
  business_name text not null check (char_length(business_name) between 1 and 120),
  business_type text not null,
  city text not null check (char_length(city) between 1 and 120),
  postal_code text not null check (postal_code ~ '^\d{5}$'),
  tone text not null default 'chaleureux',
  audience text check (char_length(audience) <= 300),
  description text check (char_length(description) <= 1000),
  specialties text check (char_length(specialties) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.my_business_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.businesses where owner_id = auth.uid();
$$;

-- ---------- social_accounts (jetons chiffrés, jamais exposés) -------------
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  platform public.social_platform not null,
  account_id text not null,          -- id Instagram professionnel, ou id de Page Facebook
  account_name text,
  page_id text,                      -- Page Facebook liée
  encrypted_access_token text not null, -- AES-GCM, clé dans les secrets des Edge Functions
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  connection_status public.connection_status not null default 'connected',
  meta_user_id text,                 -- pour traiter les demandes de suppression envoyées par Meta
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, platform)
);
create index on public.social_accounts (meta_user_id);

-- Vue SANS jeton pour l'application.
create view public.social_accounts_public with (security_invoker = true) as
  select id, business_id, platform, account_name, connection_status, token_expires_at, updated_at
  from public.social_accounts;

-- ---------- posts ---------------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  image_url text not null,            -- chemin dans le bucket privé post-images
  instagram_caption text,
  facebook_caption text,
  hashtags text[] not null default '{}',
  occasion text,
  status public.post_status not null default 'draft',
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.posts (business_id, created_at desc);
create index on public.posts (status, scheduled_at) where status = 'scheduled';

-- ---------- post_publications (1 ligne par réseau, idempotente) -----------
create table public.post_publications (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  platform public.social_platform not null,
  idempotency_key text not null,
  platform_post_id text,
  platform_post_url text,
  status public.publication_status not null default 'pending',
  error_message text,
  attempts int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, platform)          -- une publication ne part jamais deux fois sur le même réseau
);
create unique index on public.post_publications (idempotency_key, platform);

-- Journal des opérations (traçabilité, sans secrets).
create table public.post_events (
  id bigint generated always as identity primary key,
  post_id uuid not null references public.posts (id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on public.post_events (post_id);

-- ---------- calendrier commercial ----------------------------------------
-- Les dates mobiles sont calculées par le code (src/lib/events.ts) ;
-- cette table sert aux événements locaux et aux exceptions territoriales.
create table public.commercial_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  event_date date not null,
  end_date date,
  description text,
  territory text,                     -- ex. '06', '20', '974' ; null = national
  business_types text[],              -- null = tous les métiers
  notify_days_before int not null default 7,
  strategy text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.commercial_events (event_date) where active;

-- ---------- campagnes (Phase 2, structure prête) -------------------------
create table public.event_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  event_id uuid references public.commercial_events (id) on delete set null,
  event_key text,                     -- id calculé (ex. 'noel-2026') si événement national
  mode public.campaign_mode not null default 'assisted',
  approved_caption text,
  approved_image_url text,
  scheduled_at timestamptz,
  auto_publish boolean not null default false, -- autorisation explicite et révocable
  approval_status public.approval_status not null default 'pending',
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (not auto_publish or (approval_status = 'approved' and approved_caption is not null and approved_image_url is not null))
);

-- ---------- notifications -------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  title text not null,
  message text not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.notification_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  enabled boolean not null default true,
  days_before int not null default 7 check (days_before between 1 and 30),
  preferred_hour int not null default 9 check (preferred_hour between 0 and 23),
  frequency text not null default 'each_event',
  expo_push_token text,
  consent_at timestamptz
);

-- ---------- abonnements (Phase 2) ----------------------------------------
create table public.plans (
  id text primary key,                -- 'discovery' | 'essential' | 'premium'
  name text not null,
  monthly_price_cents int not null,
  stripe_price_id text,
  limits jsonb not null default '{}'  -- ex. {"ai_generations_per_month": 100}
);
insert into public.plans (id, name, monthly_price_cents, limits) values
  ('discovery', 'Découverte', 0, '{"ai_generations_per_month": 60, "trial_days": 30}'),
  ('essential', 'Essentielle', 2900, '{"ai_generations_per_month": 100}'),
  ('premium', 'Premium', 4900, '{"ai_generations_per_month": 300, "campaigns": true}');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  plan text not null default 'discovery' references public.plans (id),
  status text not null default 'trialing',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stripe_events (    -- idempotence des webhooks Stripe
  id text primary key,
  received_at timestamptz not null default now()
);

-- ---------- historique IA -------------------------------------------------
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,
  prompt_version text not null,
  input_data jsonb not null,
  output_data jsonb,
  tokens_in int,
  tokens_out int,
  error text,
  created_at timestamptz not null default now()
);
create index on public.ai_generations (business_id, created_at desc);

-- ---------- updated_at automatique ---------------------------------------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger t_businesses before update on public.businesses for each row execute function public.touch_updated_at();
create trigger t_social before update on public.social_accounts for each row execute function public.touch_updated_at();
create trigger t_posts before update on public.posts for each row execute function public.touch_updated_at();
create trigger t_pubs before update on public.post_publications for each row execute function public.touch_updated_at();
create trigger t_subs before update on public.subscriptions for each row execute function public.touch_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.users enable row level security;
alter table public.businesses enable row level security;
alter table public.social_accounts enable row level security;
alter table public.posts enable row level security;
alter table public.post_publications enable row level security;
alter table public.post_events enable row level security;
alter table public.commercial_events enable row level security;
alter table public.event_campaigns enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_settings enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.ai_generations enable row level security;

create policy "moi" on public.users for select using (id = auth.uid() or public.is_admin());

create policy "ma boutique - lire" on public.businesses for select using (owner_id = auth.uid() or public.is_admin());
create policy "ma boutique - créer" on public.businesses for insert with check (owner_id = auth.uid());
create policy "ma boutique - modifier" on public.businesses for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- social_accounts : le commerçant peut lire SES lignes, mais la colonne du jeton chiffré
-- lui est retirée par les droits par colonne ci-dessous. Seul le serveur (service role) la lit.
create policy "mes réseaux - lire" on public.social_accounts for select using (business_id = public.my_business_id());
revoke select on public.social_accounts from anon, authenticated;
grant select (id, business_id, platform, account_name, connection_status, token_expires_at, updated_at)
  on public.social_accounts to authenticated;
grant select on public.social_accounts_public to authenticated;

create policy "mes posts" on public.posts for select using (business_id = public.my_business_id());
create policy "mes publications" on public.post_publications for select
  using (exists (select 1 from public.posts p where p.id = post_id and p.business_id = public.my_business_id()));
create policy "mon journal" on public.post_events for select
  using (exists (select 1 from public.posts p where p.id = post_id and p.business_id = public.my_business_id()));

create policy "calendrier - lire" on public.commercial_events for select using (active);
create policy "calendrier - admin" on public.commercial_events for all using (public.is_admin()) with check (public.is_admin());

create policy "mes campagnes" on public.event_campaigns for all
  using (business_id = public.my_business_id()) with check (business_id = public.my_business_id());
create policy "mes notifications" on public.notifications for select using (business_id = public.my_business_id());
create policy "mes réglages notif" on public.notification_settings for all
  using (business_id = public.my_business_id()) with check (business_id = public.my_business_id());
create policy "offres - lire" on public.plans for select using (true);
create policy "mon abonnement" on public.subscriptions for select using (business_id = public.my_business_id());
create policy "mes générations" on public.ai_generations for select using (business_id = public.my_business_id());
-- stripe_events : aucune policy => accessible uniquement par le serveur (service role).
-- Les écritures sur posts / publications / ai_generations / subscriptions passent
-- exclusivement par les Edge Functions (service role).

-- =====================================================================
-- STOCKAGE : bucket privé des photos
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "photos - envoyer dans mon dossier" on storage.objects for insert to authenticated
  with check (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos - lire mon dossier" on storage.objects for select to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "photos - supprimer mon dossier" on storage.objects for delete to authenticated
  using (bucket_id = 'post-images' and (storage.foldername(name))[1] = auth.uid()::text);
