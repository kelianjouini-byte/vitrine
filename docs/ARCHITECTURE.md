# Vitrine — architecture (Phase 1)

## Parcours utilisateur
1. **Premier lancement** (4 étapes) : boutique (prénom, nom, métier, ville, code postal) → style (ton, spécialités, clientèle, description) → réseaux (OAuth Meta, facultatif) → « Votre boutique est prête ! » → COMMENCER.
2. **Accueil** : gros bouton PRENDRE UNE PHOTO, prochaine occasion pour son métier, chiffres du mois.
3. **Création** : appareil photo (ouvert directement sur téléphone) ou galerie, recadrage 4:5 → envoi au stockage privé → IA → aperçu.
4. **Aperçu** : photo + texte + hashtags façon Instagram ; PUBLIER MAINTENANT / MODIFIER / REFAIRE (sans reprendre la photo) ; choix Instagram / Facebook / les deux.
5. **Publication** : « Votre publication est en préparation… » → « Vitrine publie votre contenu. » → résultat réseau par réseau (en ligne / échec / non configuré), lien vers le post, réessayer.
6. **Fêtes** : occasions des 12 prochains mois filtrées par métier, rappels locaux N jours avant à l'heure choisie.
7. **Mes posts** : historique et statut de chaque publication. **Réglages** (avatar) : compte, réseaux, rappels, état des services, suppression des données.

## Flux serveur
```
App ──business-ai (inscription)──► detect : nom + ville → recherche Google de Gemini (2.5, gratuite 500/jour) → métier proposé, à confirmer
                                ──► occasions : métier hors liste → l'IA choisit ses occasions dans le calendrier vérifié
                                    (limite 15/h/compte, journal ai_lookups lisible par le serveur seul)
App ──upload──► Storage post-images/<user_id>/<uuid>.jpg (privé)
App ──generate-post──► vérifie l'utilisateur, limite 20/h, URL signée 10 min, métier exact + consigne du métier (src/lib/trades.ts)
                       ──► OpenAI (JSON strict) ──► contrôle « pas de prix/promo inventés »
                       ──► posts (awaiting_approval) + ai_generations
App ──publish-post──► verrou status=publishing ──► pour chaque réseau :
                       post_publications (unique post+réseau) ──► déjà publié ? on saute
                       jeton déchiffré ──► Instagram : media → statut → media_publish → permalink
                                       ──► Facebook : /{page}/photos
                       ──► post_events (journal) ──► posts.status = published | partially_published | failed
```

## Contraintes Meta identifiées
- Publication Instagram uniquement pour les comptes **professionnels** (Business/Creator) reliés à une Page Facebook (parcours Facebook Login). Un parcours « Instagram Login » existe aussi pour les comptes sans Page : à évaluer en Phase 2.
- L'image doit être accessible publiquement par Meta au moment de la création du conteneur (URL signée 1 h), en JPEG.
- Quota Instagram : environ 100 publications API par 24 h par compte (largement suffisant).
- Les permissions `pages_manage_posts` et `instagram_content_publish` exigent l'**accès avancé** via la revue d'app Meta avant d'ouvrir au public ; en mode développement, seuls les comptes testeurs fonctionnent.
- Jetons : jeton utilisateur long (~60 jours) → jeton de Page sans expiration ; il peut être invalidé (mot de passe changé, accès retiré) → statut `expired` et notification « reconnecter ».

## Préparé pour plus tard
- `event_campaigns` (modes assisté / semi-auto / auto, `auto_publish` impossible sans légende + visuel approuvés).
- `notifications`, `notification_settings` (Expo Push), `plans`, `subscriptions`, `stripe_events`.
- WhatsApp : même pipeline (`generate-post` puis `publish-post`) appelé depuis un futur webhook WhatsApp Business, avec confirmation explicite par message.
