# Vitrine — architecture (Phase 1)

## Parcours utilisateur
1. **Premier lancement** (4 étapes) : boutique (prénom, nom, métier, ville, code postal) → style (ton, spécialités, clientèle, description) → réseaux (OAuth Meta, facultatif) → « Votre boutique est prête ! » → COMMENCER.
2. **Accueil** : gros bouton PRENDRE UNE PHOTO, prochaine occasion pour son métier, chiffres du mois.
3. **Création** : appareil photo (ouvert directement sur téléphone) ou galerie (jusqu'à 10 photos) → recadrage maison (glisser, zoom −/+ ou deux doigts, format Portrait 4:5 / Carré / Paysage 1,91:1, le même pour tout le carrousel ; `src/components/PhotoCropper.tsx`, calculs dans `src/lib/crop.ts`) → liste des photos (ordre, recadrer, retirer) → envoi au stockage privé → IA (regarde les 3 premières) → aperçu.
4. **Aperçu** : photo ou carrousel qui défile (`PhotoCarousel`) + texte + hashtags façon Instagram ; PUBLIER MAINTENANT / MODIFIER / REFAIRE (sans reprendre la photo) ; choix Instagram / Facebook / les deux.
5. **Publication** : « Votre publication est en préparation… » → « Vitrine publie votre contenu. » → résultat réseau par réseau (en ligne / échec / non configuré), lien vers le post, réessayer.
6. **Fêtes** : occasions des 12 prochains mois filtrées par métier, rappels locaux N jours avant à l'heure choisie.
7. **Mes posts** : historique et statut de chaque publication. **Réglages** (avatar) : compte, réseaux, rappels, état des services, suppression des données.

## Flux serveur
```
App ──business-ai (inscription)──► detect : nom + ville → recherche Google de Gemini (2.5, gratuite 500/jour) → métier + produits,
                                    ce qui rend la boutique unique, clientèle (pré-remplis, à vérifier ; jamais de prix ni d'horaires)
                                ──► occasions : métier hors liste → l'IA choisit ses occasions dans le calendrier vérifié
                                    (limite 15/h/compte, journal ai_lookups lisible par le serveur seul)
App ──post-ideas──► « Je ne sais pas quoi poster » : carte d'identité + prochaines fêtes + 8 derniers posts + 👍/👎
                       (post_idea_feedback) → 3 idées (titre, quoi photographier, pourquoi) ; idées avec prix/promo/horaire écartées
                       limite 12/h/boutique (post_ideas). Une idée choisie est envoyée à generate-post (champ idea).
App ──monthly-report──► « Mon bilan » : l'app compte ses VRAIS posts publiés (src/lib/report.ts : ce mois, mois d'avant,
                       20 min gagnées par post) et envoie ces chiffres + les occasions du mois suivant → 1 conseil de l'IA.
                       Conseil refusé s'il contient un chiffre autre que les vrais, un prix ou un horaire. Cache par mois + chiffres
                       et limite 10/h/boutique (monthly_reports). Vues, abonnés et meilleur post : « bientôt » (statistiques Meta).
                       Notification locale le 1er du mois « Votre bilan de [mois] est prêt » (12 mois programmés d'avance).
App ──upload──► Storage post-images/<user_id>/<uuid>.jpg (privé)
App ──generate-post──► vérifie l'utilisateur, limite 20/h, URL signée 10 min, métier exact + consigne du métier (src/lib/trades.ts)
                       ──► OpenAI (JSON strict) ──► contrôle « pas de prix/promo inventés »
                       ──► posts (awaiting_approval) + ai_generations
App ──publish-post──► verrou status=publishing ──► pour chaque réseau :
                       post_publications (unique post+réseau) ──► déjà publié ? on saute
                       jeton déchiffré ──► Instagram : media → statut → media_publish → permalink
                                                    (carrousel : 1 media is_carousel_item par photo → media CAROUSEL)
                                       ──► Facebook : /{page}/photos
                                                    (plusieurs photos : /photos published=false → /{page}/feed attached_media)
                       photos : posts.image_urls (ordre du carrousel, 10 max) ; posts.image_url = 1re photo
                       ──► post_events (journal) ──► posts.status = published | partially_published | failed
App ──team──► login (code employé → session) · context (rôle, boutiques, posts à valider)
              submit (employé : post → review_state pending) · approve (patron : publish via _shared/publishCore.ts)
              reject · members/add/update/new_code/remove · add_shop/remove_shop (ligne Stripe « Boutique en plus »)
              RLS : my_company_id(), can_access_business(), is_patron_of() (security definer)
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
