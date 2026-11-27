-- Taille de l'équipe de la boutique (patron compris), demandée à l'inscription et dans Réglages.
-- Sert à adapter l'offre. Facultatif. Demande de Kelian, 27 nov. 2026.
alter table public.businesses
  add column if not exists employee_count text
  check (employee_count is null or employee_count in ('seul', '2-5', '6-10', '11+'));
