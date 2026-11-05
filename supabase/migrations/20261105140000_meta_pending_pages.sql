-- « Sur quelle Page publier ? » : quand le compte Facebook gère plusieurs Pages,
-- leurs jetons attendent ici (CHIFFRÉS, 30 minutes maximum) que le commerçant choisisse dans Vitrine.
-- Seul le serveur (service role) lit cette table : RLS activée, aucune règle pour l'appli.
create table if not exists public.meta_pending_pages (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  meta_user_id text not null,
  granted_scopes text[] not null default '{}',
  encrypted_pages text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.meta_pending_pages enable row level security;
revoke all on public.meta_pending_pages from anon, authenticated;
