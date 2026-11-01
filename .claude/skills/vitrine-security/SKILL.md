---
name: vitrine-security
description: Sécurité et RGPD de Vitrine (Supabase RLS, clés API, chiffrement des jetons Meta, Stripe, webhooks, limitation de débit, suppression et export des données). À utiliser avant toute mise en production, toute nouvelle table ou Edge Function, et pour une revue de sécurité.
---

# Vitrine — Expert sécurité & RGPD

## Principes non négociables
1. **Aucune clé secrète dans l'app ni dans Git.** Côté app, seules `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publiques). Tout le reste : `supabase secrets set`. Vérifier avec `git grep -nE "sk-|sk_live|EAA[A-Za-z0-9]{20}|service_role"` avant chaque commit.
2. **RLS partout** : chaque table a `enable row level security` ; un commerçant n'accède qu'à `business_id = public.my_business_id()`. Les écritures sensibles (posts, publications, IA, abonnements) se font uniquement en service role dans les Edge Functions.
3. **Jetons Meta** : chiffrés AES-256-GCM (`_shared/crypto.ts`, clé `TOKEN_ENCRYPTION_KEY`), colonne `encrypted_access_token` retirée des droits `authenticated` (droits par colonne). Jamais journalisés, jamais renvoyés au client. Rotation de clé : préfixe de version `v1:`.
4. **Entrées** : valider chaque champ côté serveur (longueurs, formats, chemins d'images limités à `<user_id>/`, pas de `..`). Bucket `post-images` privé, 10 Mo max, JPEG/PNG/WebP.
5. **Abus** : `rateLimit()` sur les fonctions coûteuses ; verrou + contrainte unique pour l'idempotence des publications.
6. **OAuth** : `state` signé HMAC avec expiration ; liste blanche des `redirect_uri`.
7. **Stripe (phase 2)** : vérifier la signature des webhooks (`STRIPE_WEBHOOK_SECRET`), idempotence via la table `stripe_events`, ne jamais faire confiance au prix envoyé par le client (prix dans `public.plans`).
8. **Logs** : messages d'erreur génériques pour l'utilisateur, détails techniques sans secrets côté serveur (Sentry à brancher, avec filtrage des données personnelles).

## RGPD
- Export : Edge Function `account` `{action:'export'}`. Suppression : `{action:'delete'}` (photos + compte, suppression en cascade).
- Suppression demandée par Meta : `meta-data-deletion` (signed_request vérifié).
- À rédiger avant lancement : politique de confidentialité, CGU, CGV, politique de conservation des images (proposition : photos supprimées 90 jours après publication), registre des traitements, sous-traitants (Supabase, OpenAI, Meta, Stripe, Expo) avec hébergement UE si possible.
- Consentement explicite aux notifications (permission système + réglage dans l'app).

## Revue de sécurité (checklist)
- [ ] Nouvelle table : RLS + policies + index ? Aucune policy trop large (`using (true)` seulement pour des données publiques) ?
- [ ] Nouvelle Edge Function : `requireMerchant()` ou signature vérifiée ? Entrées validées ? Erreurs via `HttpError` ?
- [ ] Aucun secret dans le diff, `.env` ignoré par Git ?
- [ ] Toute opération destructive ou en production : **demander l'accord du propriétaire du projet avant**.
