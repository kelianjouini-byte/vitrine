-- Abonnements Vitrine (décision de Kelian, 5 nov. 2026) :
-- 1er mois offert, puis « Mensuel » 39 €/mois sans engagement, ou « Annuel » 29 €/mois avec engagement 1 an (payé chaque mois).
-- Le paiement passe par Stripe (Checkout + portail client). Rien n'est supprimé : les anciennes offres sont seulement masquées.

alter table public.plans add column if not exists active boolean not null default true;
alter table public.plans add column if not exists commitment_months int not null default 0;

insert into public.plans (id, name, monthly_price_cents, commitment_months, limits) values
  ('monthly', 'Mensuel', 3900, 0, '{}'),
  ('annual', 'Annuel', 2900, 12, '{}')
on conflict (id) do update set name = excluded.name, monthly_price_cents = excluded.monthly_price_cents,
  commitment_months = excluded.commitment_months, active = true;

update public.plans set name = 'Mois offert', active = false where id = 'discovery';
update public.plans set active = false where id in ('essential', 'premium');

alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table public.subscriptions add column if not exists trial_end timestamptz;
alter table public.subscriptions add column if not exists commitment_ends_at timestamptz;
