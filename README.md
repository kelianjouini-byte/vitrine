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
| `STRIPE_SECRET_KEY` | secrets Supabase | Paiement des abonnements (clé secrète Stripe, `sk_test_…` ou `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | secrets Supabase | Vérifie que les messages du webhook viennent bien de Stripe (`whsec_…`) |

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
6. Domaine de l'app : `kelianjouini-byte.github.io` (la version web revient sur `…/vitrine/app/meta-connected` après la connexion). Dès que `META_APP_ID`, `META_APP_SECRET` et `TOKEN_ENCRYPTION_KEY` sont posés, le bouton « Connecter Instagram et Facebook » apparaît ; avant, l'appli affiche « Bientôt disponible ».
7. Plusieurs Pages sur le compte : Vitrine demande « Sur quelle Page publier ? » (jetons gardés chiffrés 30 minutes dans `meta_pending_pages`, lisible seulement par le serveur).
7b. Publication : posts (1 à 10 photos) via `publish-post`, stories photo ou vidéo (MP4/MOV) via `publish-story`.
8. En mode développement, ajouter vos comptes comme testeurs. Le compte Instagram doit être **professionnel** et relié à une **Page Facebook**.
9. Avant le public : vérification de l'entreprise, politique de confidentialité, CGU, vidéo de démo, demande d'accès avancé (revue Meta, compter plusieurs semaines).

## 6. Configuration Stripe (paiement)

Offres : **15 jours offerts** (sans carte bancaire), puis **Mensuel 39 €/mois** (sans engagement) ou **Annuel 29 €/mois** (engagement 1 an, payé chaque mois). Les montants vivent dans la table `plans`.

- Écran « Mon abonnement » (Réglages) → fonction `billing` → page de paiement Stripe Checkout (carte enregistrée, 1er prélèvement à la fin de l'essai).
- Fin de l'essai sans abonnement : l'appli n'affiche plus que « Mon abonnement » (bilan des 15 jours + offres + suppression du compte), et le serveur refuse d'écrire ou de publier (`_shared/access.ts`, erreur `trial_over`). Seulement quand `STRIPE_SECRET_KEY` est défini. Accès offert à la main : `status = 'free'` dans `subscriptions`.
- Bilan de l'essai (3 jours avant la fin) : posts et stories vraiment publiés, temps gagné, et projection sur un mois au même rythme.
- Le produit « Vitrine », les prix (`lookup_key` `vitrine_mensuel` / `vitrine_annuel`) et deux réglages du portail client (avec et sans résiliation) sont **créés automatiquement** au premier usage.
- Offre Annuel : pendant les 12 mois d'engagement, le portail permet de changer de carte et de voir les factures, mais pas de résilier en un clic.
- Webhook `stripe-webhook` (signature vérifiée, idempotent via `stripe_events`) : met à jour `subscriptions`.
- Suppression du compte : l'abonnement Stripe est arrêté immédiatement.
- Parrainage (fonction `referral`, tables `referral_codes`, `referrals`, `referral_rewards`, lues seulement par le serveur) : chaque boutique a un code (`FLEURS-7K4Q9`). Le filleul le tape au paiement : coupon Stripe `vitrine_parrainage_filleul` (-10 € pendant 3 mois, créé automatiquement). À chaque facture payée du filleul (`invoice.paid`), le parrain reçoit 10 € de crédit sur son solde Stripe, sans jamais dépasser le prix d'un mois. Même carte, même adresse ou même nom de facturation : parrainage bloqué. Lien de partage : `…/app/?parrain=CODE`.

Réglages à faire une fois :
1. Secret `STRIPE_SECRET_KEY` dans Supabase (Edge Functions → Secrets).
2. Dans Stripe → Webhooks : adresse `https://<projet>.supabase.co/functions/v1/stripe-webhook`, événements `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid` (parrainage). Copier la clé de signature dans le secret `STRIPE_WEBHOOK_SECRET`.

## 7. Déploiement

- Serveur : `supabase db push` + `supabase functions deploy`.
- App : `npx eas-cli@latest build -p all` (compte Expo nécessaire, compte Apple Developer 99 $/an, compte Google Play 25 $ une fois), puis `eas submit`.
- Démo web : `npm run build:web && node scripts/build-demo.mjs` → `demo/index.html`.
- Icônes et écran d'ouverture (logo « La devanture ») : `NODE_PATH=$(npm root -g) node scripts/build-icons.mjs` → `assets/*.png`.
- Recommencer depuis l'inscription (test web) : ouvrir `https://kelianjouini-byte.github.io/vitrine/app/?nouveau` (efface les données de cet appareil seulement).

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

## Adresses en ligne (GitHub Pages)
- `https://kelianjouini-byte.github.io/vitrine/` : site de présentation (`site/index.html`).
- `https://kelianjouini-byte.github.io/vitrine/app/` : l'appli web. Même origine que le site, donc les données gardées dans le navigateur ne changent pas.
- Pages légales : `…/vitrine/conditions/`, `…/confidentialite/`, `…/suppression/`, `…/mentions-legales/` (dossier `public/`).
- Les anciens liens de l'appli (`…/vitrine/abonnement`, `…/vitrine/meta-connected`) sont renvoyés vers `…/vitrine/app/…` par `404.html` (voir `scripts/build-site.mjs`).
