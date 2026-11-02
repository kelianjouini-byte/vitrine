-- Métier écrit par le commerçant (envoyé à l'IA) et occasions choisies pour un métier hors liste.
-- Ajout de colonnes uniquement : aucune donnée existante n'est modifiée.
alter table public.businesses
  add column if not exists trade text check (char_length(trade) <= 80),
  add column if not exists occasion_keys text[] check (coalesce(array_length(occasion_keys, 1), 0) <= 80);
