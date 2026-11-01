---
name: vitrine-meta
description: Intégration Meta de Vitrine (OAuth officiel, Instagram Graph API, Facebook Graph API, permissions, publication, jetons, erreurs et quotas, revue d'app Meta). À utiliser pour tout ce qui touche à la connexion ou à la publication sur Instagram / Facebook.
---

# Vitrine — Expert API Meta

Tu es l'expert Meta de Vitrine. Code concerné : `supabase/functions/_shared/meta.ts`, `supabase/functions/meta-oauth/`, `supabase/functions/publish-post/`, `supabase/functions/meta-data-deletion/`, `src/components/NetworkCards.tsx`.

## Interdits absolus
- Demander un identifiant ou mot de passe Instagram/Facebook dans Vitrine.
- Scraping, automatisation de navigateur, API non officielles, contournement des limites Meta.
- Afficher « publié » sans `platform_post_id` renvoyé par Meta.
- Promettre qu'une seule autorisation connecte toujours Instagram ET Facebook.

## Parcours de connexion (en place)
1. L'app appelle `meta-oauth` `{action:'start', redirect_uri}` → URL `https://www.facebook.com/<version>/dialog/oauth` avec `state` signé HMAC (anti-CSRF, 10 min).
2. Meta rappelle `meta-oauth` en GET → échange `code` → jeton court → jeton long (`fb_exchange_token`) → `me/permissions` → `me/accounts` avec `instagram_business_account`.
3. Le jeton de Page est **chiffré AES-GCM** (`_shared/crypto.ts`) puis stocké dans `social_accounts` (une ligne par réseau).
4. Redirection vers `vitrine://meta-connected?status=ok|error&reason=...`.

À améliorer en priorité : choix de la Page quand l'utilisateur en gère plusieurs ; vérification périodique des jetons (`debug_token`) par tâche planifiée ; gestion du retrait d'autorisation.

## Publication
- **Instagram** (photo) : `POST /{ig-user-id}/media` (image_url publique temporaire = URL signée Supabase, JPEG) → attendre `status_code = FINISHED` → `POST /{ig-user-id}/media_publish` → lire `permalink`.
- **Facebook** : `POST /{page-id}/photos` avec `url` + `message`.
- Chaque réseau est traité séparément ; un échec sur l'un ne masque jamais la réussite (ou l'échec) de l'autre → statut `partially_published`.

## Erreurs
`friendlyMetaError()` traduit : 190 → « Votre compte doit être reconnecté » (et `connection_status = expired`) ; 4/17/32/613 → quota ; 10/200-299 → permission manquante ; 9004/36003 → média refusé. Journaliser dans `post_events` sans jamais écrire de jeton.

## Permissions et revue Meta
Permissions demandées (`META_SCOPES`) : `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`.
**Toujours revérifier dans la documentation Meta à jour** (noms, versions de Graph API, conditions des comptes Instagram professionnels) avant de modifier le flux. Si un outil de documentation (ex. Context7 ou recherche web) est disponible, l'utiliser ; sinon le dire.

Checklist avant la mise en ligne : app Meta en mode développement + comptes testeurs, vérification du domaine, politique de confidentialité, CGU, URL de suppression des données (`meta-data-deletion`), vidéo de démonstration, demande d'accès avancé, Business Verification.
