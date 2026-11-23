# Applis App Store et Google Play

## Comment c'est fait
- **Capacitor** emballe la version web de Vitrine (la même que `vitrineappli.fr/app`) dans une vraie appli iPhone (`ios/`) et Android (`android/`).
  Tout le code reste dans `src/` ; dans ces applis `Platform.OS` vaut toujours `web`. `src/lib/native.ts` dit si l'on est dans une appli des stores (`isStoreApp`).
- Pourquoi pas une appli Expo « native » : les Reels avec texte, la musique des stories et l'image tirée des vidéos n'existent qu'en version web.
- Contenu de l'appli : `node scripts/build-store.mjs` (export web à la racine dans `dist-store/`, puis `npx cap sync`).
- Icônes et écrans de démarrage : `python3 scripts/store-icons.py` (à relancer seulement si le logo change).
- Identifiant de l'appli (définitif une fois publiée) : `fr.vitrineappli.app`.

## Ce qui change dans les applis des stores
| Sujet | Site web | Applis des stores |
|---|---|---|
| Paiement | Écran « Mon abonnement » avec offres et Stripe | **Ni prix ni bouton de paiement** (règle Apple 3.1.1 / Google Play). Écran `StoreSubscription` : essai, « regardez vos e-mails », « Renvoyer l'e-mail » |
| Parrainage, ajout de boutiques payantes | Oui | Masqués (ce sont des achats) |
| Connexion Instagram / Facebook | Même onglet | Navigateur du téléphone (Facebook refuse sa connexion dans une appli), retour par `vitrine://meta-connected` (déjà accepté par `meta-oauth`) |
| Rappels (fêtes, planning, idées du lundi, bilan, fin d'essai) | Non | Notifications locales (`@capacitor/local-notifications`) |
| Bouton retour Android | — | Revient à l'écran précédent |

## E-mails de fin d'essai (`supabase/functions/trial-emails`)
- Tous les jours à 10 h (GitHub Actions `trial-emails.yml`) : rappel 3 jours avant la fin, puis e-mail le jour de la fin. Une seule fois chacun (table `trial_emails`).
- Bouton « Renvoyer l'e-mail » de l'appli : 3 fois par heure au plus.
- Chaque bouton de l'e-mail est un lien signé (30 jours) qui ouvre directement la page Stripe de l'offre, sans se reconnecter. Retour sur `/app/merci/`.
- Secrets Supabase : `BREVO_API_KEY`, `CRON_SECRET` (+ facultatifs `MAIL_FROM`, `MAIL_REPLY_TO`). Déployer avec `verify_jwt = false`.
- Base : `supabase/migrations/20261123150000_trial_emails.sql`.

## Fabriquer et envoyer (GitHub Actions, sans Mac ni Xcode)
Onglet **Actions** > **Applis App Store et Google Play** > **Run workflow** (choisir Android, iPhone ou les deux, et le numéro de version).
- Android : fichier `.aab` signé à télécharger en bas de la page de la fabrication, puis à déposer dans Google Play Console.
- iPhone : envoyé directement sur App Store Connect, visible dans TestFlight après quelques minutes.
- À chaque modification de `ios/`, `android/`… sur une branche de travail, une vérification sans signature tourne toute seule.

Secrets GitHub (Settings > Secrets and variables > Actions) :
| Nom | Où le trouver |
|---|---|
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD` | Clé de signature Android (fichier fourni à Kelian, gardé hors de Git) |
| `APPLE_TEAM_ID` | developer.apple.com > Account > Membership details > Team ID |
| `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_KEY_P8` | App Store Connect > Users and Access > Integrations > App Store Connect API > clé avec le rôle **Admin** (contenu du fichier `.p8`) |
| `CRON_SECRET` | Le même que dans Supabase |

## Mises à jour
Une modification du code arrive tout de suite sur le site, mais **pas** dans les applis : il faut relancer la fabrication puis envoyer la nouvelle version aux stores (vérification Apple ≈ 1 jour).
Le serveur (Edge Functions) doit donc rester compatible avec les anciennes versions des applis.
