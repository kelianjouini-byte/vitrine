-- Offre fondateur (décision de Kelian, 12 nov. 2026) :
-- 29 € par mois sans engagement, réservée aux 15 premières boutiques, gardée tant que l'abonnement continue.
-- Une boutique en plus : 15 € par mois. Pas de date de fin : Kelian ferme l'offre quand il veut avec
--   update public.plans set active = false where id = 'founder';
-- (ceux qui l'ont déjà la gardent). Pour changer le nombre de places :
--   update public.plans set places = 20 where id = 'founder';

alter table public.plans add column if not exists places int;

insert into public.plans (id, name, monthly_price_cents, commitment_months, extra_shop_price_cents, places, limits, active) values
  ('founder', 'Fondateur', 2900, 0, 1500, 15, '{}', true)
on conflict (id) do update set name = excluded.name, monthly_price_cents = excluded.monthly_price_cents,
  commitment_months = excluded.commitment_months, extra_shop_price_cents = excluded.extra_shop_price_cents, places = excluded.places;

-- Numéro de boutique fondatrice (1, 2, 3…), donné une seule fois par le webhook Stripe et jamais réutilisé.
alter table public.subscriptions add column if not exists founder_number int;
create unique index if not exists subscriptions_founder_number_key on public.subscriptions (founder_number) where founder_number is not null;
