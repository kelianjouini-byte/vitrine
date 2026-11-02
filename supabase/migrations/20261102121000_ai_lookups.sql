-- Journal des recherches IA faites à l'inscription (métier sur internet, choix des occasions).
-- Sert uniquement à limiter les abus : lu et écrit par le serveur seul (aucune politique = aucun accès client).
create table if not exists public.ai_lookups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('detect', 'occasions')),
  created_at timestamptz not null default now()
);
create index if not exists ai_lookups_user_time on public.ai_lookups (user_id, created_at desc);
alter table public.ai_lookups enable row level security;
