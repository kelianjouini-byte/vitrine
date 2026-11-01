---
name: vitrine-ai
description: Moteur IA de Vitrine (OpenAI multimodal, analyse de photo, rédaction de posts Instagram/Facebook, hashtags locaux, ton du commerce, contrôle du contenu, coûts). À utiliser pour modifier le prompt, la génération, la régénération ou la qualité des textes.
---

# Vitrine — Expert IA générative

Code : `supabase/functions/_shared/openai.ts` (prompt système, schéma JSON, contrôle), `supabase/functions/generate-post/index.ts` (contexte, historique, limites), `src/lib/api.ts` (`generatePost`, `exampleCaption`).

## Règles absolues
- **Ne jamais inventer** prix, promotions, réductions, disponibilités, horaires, stock, caractéristiques invisibles sur la photo.
- Les seules informations commerciales autorisées sont celles saisies par le commerçant (`merchant_note`) et son profil.
- `containsInventedCommercialInfo()` rejette un texte contenant prix/promo non fournis : une nouvelle tentative, puis erreur. Ne jamais affaiblir ce contrôle.
- La clé OpenAI n'existe que dans les secrets serveur (`OPENAI_API_KEY`). Le modèle est réglable par `OPENAI_MODEL`.
- Sans clé : renvoyer `openai_not_configured` ; l'app affiche alors un **texte d'exemple clairement étiqueté**, qui ne prétend pas décrire la photo.

## Entrées / sorties
Entrées : photo (URL signée, `detail: low` pour limiter les coûts), nom, métier, ville, code postal, ton, spécialités, description, clientèle, occasion, note du commerçant, 5 derniers textes (anti-répétition).
Sortie JSON stricte (`response_format: json_schema`) : `photo_description`, `instagram_caption`, `facebook_caption`, `call_to_action`, `hashtags[]`, `improvement_tip`.

## Style attendu
Français naturel, ton du commerce (chaleureux, élégant, dynamique, humoristique, premium, familial, traditionnel), 2 à 4 emojis, 5 à 10 hashtags (ville + métier + saison), appel à l'action simple. Instagram plus court et visuel ; Facebook un peu plus descriptif. Éviter les textes génériques (« Découvrez nos produits ! »).

Exemple (fleuriste, Lyon) :
« 🌸 Un peu de douceur pour illuminer votre journée ! Découvrez notre composition florale, réalisée avec amour dans notre boutique. Passez nous voir pour trouver le bouquet qui vous ressemble 💐 #FleuristeLyon #Lyon #Fleurs #Bouquet #CommerceLocal »

## Qualité et coûts
- Toute génération (réussie ou non) est tracée dans `ai_generations` avec `prompt_version` : **incrémenter `PROMPT_VERSION`** à chaque changement du prompt.
- Limite actuelle : 20 générations / heure / boutique (`rateLimit`). Les quotas par offre sont dans `public.plans.limits`.
- Pour évaluer un changement de prompt : préparer 10 photos variées (métiers différents), comparer avant/après, vérifier qu'aucun texte ne contient d'info inventée.
