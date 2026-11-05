# Vitrine

> Une photo, on s'occupe du reste.

Application mobile (iOS / Android) qui permet aux commerçants indépendants de publier sur Instagram et Facebook en prenant simplement une photo. L'IA écrit le texte, le commerçant valide, Vitrine publie.

**État : Phase 1 (MVP) en construction.** L'app fonctionne en local ; l'IA et la publication s'activent dès que les comptes ci-dessous sont configurés. Tant qu'ils ne le sont pas, l'app l'affiche clairement (jamais de faux succès).

---

## 1. Installation

Prérequis : Node.js 20+ et npm. Pour essayer sur téléphone : l'application **Expo Go** (gratuite).

```bash
npm install
cp .env.example .env        # puis remplir les 2 valeurs EXPO_PUBLIC_…
npx expo start              # scanner le QR code avec Expo Go
npx expo start --web        # ou l'ouvrir dans le navigateur
```

## 2. Variables d'environnement

| Variable | Où | Rôle |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` (app) | Adresse du projet Supabase (publique) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `.env` (app) | Clé publique Supabase (la sécurité repose sur la RLS) |
| `OPENAI_API_KEY` | secrets Supabase | Écriture des posts par l'IA |
| `OPENAI_MODEL` | secrets Supabase | Modèle multimodal (défaut `gpt-4.1-mini`) |
| `GROQ_API_KEY` | secrets Supabase | Facultatif, offre gratuite Groq : IA essayée en premier (très rapide), Gemini prend le relais |
| `GROQ_MODEL` | secrets Supabase | Modèle Groq qui lit les photos (défaut `qwen/qwen3.8-27b`) |
| `AI_FALLBACK_MODEL` | secrets Supabase | Modèle de secours lancé si le premier est saturé ou met plus de 7 s (Gemini : `gemini-3.5-flash-lite` par défaut) |
| `META_APP_ID`, `META_APP_SECRET` | secrets Supabase | Application Meta (connexion + publication) |
| `META_CONFIG_ID` | secrets Supabase | Facultatif : configuration Facebook Login for Business |
| `META_GRAPH_VERSION` | secrets Supabase | Version Graph API (défaut `v23.0`) |
| `TOKEN_ENCRYPTION_KEY` | secrets Supabase | Chiffrement des jetons Meta (`openssl rand -base64 32`) |
| `PUBLIC_SITE_URL` | secrets Supabase | Site public (pages légales, suivi de suppression) |
| `PUBLIC_APP_URL` | secrets Supabase | Facultatif : adresse de la version web, seule adresse https autorisée au retour de la connexion Meta (défaut `https://kelianjouini-byte.github.io/vitrine/`) |

**Aucune clé secrète ne doit jamais être mise dans l'app ou dans Git.**

## 3. Configuration Supabase

1. Créer un projet sur https://supabase.com (région Europe, ex. Paris / Francfort).
2. Installer la CLI : `npm i -g supabase`, puis `supabase login` et `supabase link --project-ref <ref>`.
3. Appliquer le schéma : `supabase db push` (tables, RLS, bucket privé `post-images`, offres).
4. Auth → Providers → Email : activer, et dans le modèle d'e-mail « Magic Link » afficher `{{ .Token }}` (code à 6 chiffres).
5. Déployer les fonctions : `supabase functions deploy` (la config `verify_jwt=false` de `meta-oauth` et `meta-data-deletion` est dans `supabase/config.toml`).
6. Définir les secrets : `supabase secrets set OPENAI_API_KEY=… META_APP_ID=… META_APP_SECRET=… TOKEN_ENCRYPTION_KEY=…`
7. Copier l'URL et la clé `anon` dans `.env`.

## 4. Configuration OpenAI

Créer une clé sur https://platform.openai.com → API keys, ajouter un moyen de paiement et **une limite de dépense mensuelle**. La mettre uniquement dans les secrets Supabase. Coût indicatif : quelques centimes par post (image en `detail: low`).

## 5. Configuration Meta (Instagram + Facebook)

1. https://developers.facebook.com → Créer une app (type Business).
2. Ajouter les produits **Facebook Login for Business** et **Instagram Graph API**.
3. URL de redirection OAuth valide : `https://<ref>.supabase.co/functions/v1/meta-oauth`.
4. URL de suppression des données : `https://<ref>.supabase.co/functions/v1/meta-data-deletion`.
5. Permissions : `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management` (à revérifier dans la doc Meta à jour).
6. Domaine de l'app : `kelianjouini-byte.github.io` (la version web revient sur `…/vitrine/meta-connected` après la connexion). Dès que `META_APP_ID`, `META_APP_SECRET` et `TOKEN_ENCRYPTION_KEY` sont posés, le bouton « Connecter Instagram et Facebook » apparaît ; avant, l'appli affiche « Bientôt disponible ».
7. Plusieurs Pages sur le compte : Vitrine demande « Sur quelle Page publier ? » (jetons gardés chiffrés 30 minutes dans `meta_pending_pages`, lisible seulement par le serveur).
7b. Publication : posts (1 à 10 photos) via `publish-post`, stories photo ou vidéo (MP4/MOV) via `publish-story`.
8. En mode développement, ajouter vos comptes comme testeurs. Le compte Instagram doit être **professionnel** et relié à une **Page Facebook**.
9. Avant le public : vérification de l'entreprise, politique de confidentialité, CGU, vidéo de démo, demande d'accès avancé (revue Meta, compter plusieurs semaines).

## 6. Configuration Stripe (Phase 2)

Tables `plans`, `subscriptions`, `stripe_events` déjà prêtes. À venir : Stripe Checkout, Billing, portail client, webhook signé et idempotent. Les tarifs vivent dans la table `plans`, pas dans le code.

## 7. Déploiement

- Serveur : `supabase db push` + `supabase functions deploy`.
- App : `npx eas-cli@latest build -p all` (compte Expo nécessaire, compte Apple Developer 99 $/an, compte Google Play 25 $ une fois), puis `eas submit`.
- Démo web : `npm run build:web && node scripts/build-demo.mjs` → `demo/index.html`.
- Icônes et écran d'ouverture (logo « La devanture ») : `NODE_PATH=$(npm root -g) node scripts/build-icons.mjs` → `assets/*.png`.
- Recommencer depuis l'inscription (test web) : ouvrir `https://kelianjouini-byte.github.io/vitrine/?nouveau` (efface les données de cet appareil seulement).

## 8. Tests

```bash
npm test                                   # calendrier commercial (Pâques, fête des mères, soldes…)
npx tsc --noEmit                           # types de l'app
deno check supabase/functions/*/index.ts   # Edge Functions
```

## 9. Documentation

- `CLAUDE.md` : guide du projet + règles.
- `docs/ARCHITECTURE.md` : architecture, parcours, contraintes Meta.
- `.claude/skills/` : 5 skills Claude Code (`/vitrine-architect`, `/vitrine-meta`, `/vitrine-design`, `/vitrine-ai`, `/vitrine-security`).
