# VITRINE — guide du projet pour Claude Code

> « Une photo, on s'occupe du reste. »
> Le commerçant s'occupe de son commerce. Vitrine s'occupe de sa visibilité.

## 1. Présentation
Vitrine est une application mobile SaaS (iOS / Android) pour les petits commerces indépendants français (fleuristes, boulangeries, coiffeurs, cavistes...). Le commerçant prend une photo, l'IA écrit la publication (texte, emojis, hashtags locaux) dans le ton de sa boutique, il valide, Vitrine publie sur Instagram et Facebook. Un calendrier des fêtes commerciales, filtré par métier, lui rappelle chaque occasion.
Cible : commerçants de 55 à 70 ans peu à l'aise avec la technologie. Offres : Découverte (1 mois gratuit), Essentielle 29 €/mois, Premium 49 €/mois.
Le propriétaire du projet est francophone et débutant : **expliquer en français simple**, sans jargon.

## 2. Architecture technique
```
App mobile (Expo)  ──►  Supabase
  écrans, état local      Auth (code par e-mail)  ·  PostgreSQL + RLS  ·  Storage privé (photos)
                          Edge Functions (Deno) ──► OpenAI (analyse photo + texte)
                                                ──► Meta Graph API (Instagram + Facebook)
                                                ──► (phase 2) Stripe Billing, Expo Push
```
- Le client ne détient **aucun secret**. Toute action sensible passe par une Edge Function.
- Sans serveur configuré, l'app fonctionne en local (profil, calendrier, rappels) et affiche clairement « non configuré » pour l'IA et la publication — **jamais de faux succès**.
- Navigation : petite pile maison (`src/lib/store.tsx`) plutôt qu'Expo Router — 4 écrans seulement, et la démo web doit tourner dans une page unique. Cette exception à `AGENTS.md` est volontaire.

## 3. Stack
Expo SDK 58 · React Native 0.88 · React 19 · TypeScript strict · Supabase (Postgres, Auth, Storage, Edge Functions Deno) · OpenAI (modèle multimodal réglable via `OPENAI_MODEL`) · Meta Graph API (OAuth officiel) · expo-image-picker · expo-notifications · expo-auth-session / expo-web-browser · react-native-svg. Phase 2 : Stripe Checkout + Billing + portail client, Expo Push. Monitoring prévu : Sentry.

## 4. Identité visuelle
Vert `#2F7658` · vert secondaire `#DCEFE3` · fond `#F8FAF7` · blanc `#FFFFFF` · texte `#24332B` · texte secondaire `#758078` · orange `#F2B66D` (occasions) · rouge `#D96B61` (erreurs). Titres serif (Fraunces/Georgia), texte Inter/système. Gros boutons, peu de texte, zéro jargon. Détails : skill `/vitrine-design`.

## 5. Organisation du projet
```
App.tsx                     racine + barre d'onglets
src/screens/                Onboarding, Home, Create (photo + aperçu), Published, Fetes, Posts, Settings
src/components/             ui.tsx, icons.tsx, NetworkCards.tsx
src/lib/                    api.ts, events.ts, store.tsx, types.ts, theme.ts, config.ts, notifications.ts, storage.ts, supabase.ts
supabase/migrations/        schéma SQL + RLS + bucket
supabase/functions/         generate-post, publish-post, meta-oauth, meta-data-deletion, account, _shared/
tests/                      tests node --test
scripts/build-demo.mjs      page web unique pour essayer l'app
docs/                       architecture et parcours
.claude/skills/             les 5 skills Vitrine
```

## 6. Règles de développement
1. Avancer par phases : **Phase 1 MVP** (compte, onboarding, accueil, photo, IA, aperçu, modification, Meta, publication, historique, calendrier, rappels) → Phase 2 (campagnes, programmation, Stripe) → Phase 3 (admin, stats, WhatsApp, multi-boutiques).
2. Installer un paquet : `EXPO_OFFLINE=1 npx expo install <paquet>`. Vérifier l'API dans les `.d.ts` du paquet.
3. Tout appel serveur passe par `src/lib/api.ts` ; fonction absente → `NotConfiguredError` affichée honnêtement.
4. Chaque écran gère chargement, erreur et état vide.
5. Pas de code dupliqué ; composants dans `src/components/ui.tsx`.
6. Avant de livrer : `npx tsc --noEmit`, `npm test`, `deno check supabase/functions/*/index.ts`, build web.
7. Documenter toute variable dans `.env.example` et `README.md`.

## 7. Règles de sécurité
- Aucune clé secrète dans le code ni dans Git (`.env` est ignoré).
- RLS sur toutes les tables ; jetons Meta chiffrés et jamais lisibles par le client.
- Publication idempotente (contrainte unique + clé + verrou). Statuts : draft, generating, awaiting_approval, scheduled, publishing, published, partially_published, failed, cancelled.
- L'IA n'invente jamais prix, promotions, disponibilités, horaires.
- Aucune publication automatique sans autorisation explicite et révocable du commerçant.
- **Demander l'accord du propriétaire avant toute opération destructive ou en production.**
Détails : skill `/vitrine-security`.

## 8. Les 5 skills
| Commande | Quand l'utiliser |
|---|---|
| `/vitrine-architect` | Nouvel écran, nouvelle table, nouvelle Edge Function, dépendance, plan de phase |
| `/vitrine-meta` | Connexion Instagram/Facebook, publication, jetons, erreurs Meta, revue d'app Meta |
| `/vitrine-design` | Écran, composant, texte d'interface, couleurs, accessibilité |
| `/vitrine-ai` | Prompt, génération, régénération, hashtags, contrôle qualité et coûts de l'IA |
| `/vitrine-security` | Revue de sécurité, RLS, secrets, RGPD, Stripe, avant toute mise en production |

Claude peut aussi les charger automatiquement quand la tâche correspond à leur description. Pour une fonctionnalité complète, enchaîner : architect → design → (meta / ai) → security.
