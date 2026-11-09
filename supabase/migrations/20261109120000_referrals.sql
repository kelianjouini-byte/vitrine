-- Parrainage entre commerçants (décision de Kelian, 9 nov. 2026).
-- Le filleul tape le code de son parrain au moment de payer. Filleul : -10 € pendant 3 mois.
-- Parrain : -10 € par mois pour chaque filleul qui paie, tant qu'il reste abonné (jusqu'à 0 €, jamais en dessous).
-- Ces tables ne sont lues et écrites QUE par le serveur (Edge Functions referral, billing, stripe-webhook) :
-- la RLS est activée sans aucune règle pour l'appli, donc un client ne peut ni lire ni modifier un parrainage.

create table if not exists public.referral_codes (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z]{3,7}-[A-Z2-9]{5}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_business_id uuid not null references public.businesses (id) on delete cascade,
  -- Une boutique ne peut être parrainée qu'une seule fois.
  referee_business_id uuid not null unique references public.businesses (id) on delete cascade,
  code text not null,
  -- pending : abonné, pas encore payé · active : a payé, le parrain gagne 10 €/mois
  -- ended : le filleul a arrêté · blocked : même personne derrière les deux boutiques (pas de réduction)
  status text not null default 'pending' check (status in ('pending', 'active', 'ended', 'blocked')),
  blocked_reason text,
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  ended_at timestamptz,
  check (referrer_business_id <> referee_business_id)
);
create index if not exists referrals_referrer_idx on public.referrals (referrer_business_id);

-- Un crédit de 10 € par facture payée du filleul, jamais deux fois pour la même facture.
create table if not exists public.referral_rewards (
  invoice_id text primary key,
  referral_id uuid not null references public.referrals (id) on delete cascade,
  amount_cents int not null check (amount_cents >= 0),
  created_at timestamptz not null default now()
);

-- Essais de codes (limite contre ceux qui essaieraient de deviner un code).
create table if not exists public.referral_checks (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists referral_checks_business_idx on public.referral_checks (business_id, created_at);

alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_rewards enable row level security;
alter table public.referral_checks enable row level security;
