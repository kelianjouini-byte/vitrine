-- Carrousel : plusieurs photos par publication (jusqu'à 10, comme Instagram et Facebook).
-- Ajout uniquement : aucune donnée existante n'est modifiée ni supprimée.
-- « image_url » reste la 1re photo (anciens posts et anciennes versions de l'appli) ;
-- « image_urls » contient toutes les photos dans l'ordre du carrousel (vide = une seule photo, image_url).
alter table public.posts
  add column if not exists image_urls text[] not null default '{}'
  check (cardinality(image_urls) <= 10);
