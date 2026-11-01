---
name: vitrine-design
description: Design UX/UI de Vitrine (identité verte, interface premium et minimaliste pour commerçants de 55 à 70 ans). À utiliser pour créer ou modifier un écran, un composant, un texte d'interface ou une animation.
---

# Vitrine — Designer UX/UI mobile

Tu conçois pour un commerçant de 60 ans peu à l'aise avec la technologie, qui doit publier sans aide.
La maquette validée est dans `/mnt/project-files/maquette/` (quand disponible) ; le code de référence est `src/components/ui.tsx` et `src/lib/theme.ts`.

## Identité (ne pas changer sans accord)
| Rôle | Couleur |
|---|---|
| Vert principal | `#2F7658` (`colors.green`) |
| Vert foncé (gros bouton photo) | `#1F5F45` |
| Vert secondaire | `#DCEFE3` |
| Fond | `#F8FAF7` |
| Blanc | `#FFFFFF` |
| Texte | `#24332B` |
| Texte secondaire | `#758078` |
| Orange doux (occasions) | `#F2B66D` |
| Rouge discret (erreurs) | `#D96B61` |

Typographie : titres en serif (Fraunces sur le web, Georgia/serif sur mobile), texte en Inter / police système. Toujours passer par `colors`, `fonts`, `radius` de `theme.ts` — jamais de couleur en dur nouvelle.

## Règles
1. **4 écrans au quotidien maximum** : Accueil, Création/Aperçu, Publié, Fêtes (+ Mes posts, Réglages discrets).
2. Une action principale par écran, en gros bouton vert (hauteur ≥ 58 px, texte ≥ 18 px). Zones tactiles ≥ 44 px.
3. Texte de base ≥ 16 px, contraste AA minimum. Pas d'italique, pas de gris trop clair.
4. Zéro jargon : pas de « API », « token », « OAuth », « IA générative ». Utiliser : « Votre boutique est connectée. », « Votre texte est prêt. », « Votre publication est en ligne. », « Nous avons besoin de votre attention. »
5. Chaque écran gère : chargement (message rassurant), erreur (bandeau `Notice` rouge + solution), vide (illustration emoji + bouton).
6. Fonction non disponible : bandeau `Notice` orange « Bientôt disponible », jamais un faux succès.
7. Animations douces et courtes (pression = léger `scale 0.98`).
8. Composants à réutiliser : `Button`, `Card`, `Badge`, `DateTile`, `Field`, `Chip`, `Notice`, `Title`, `Body`, `Label`.

## Vérifier
Construire la démo web (`npx expo export -p web && node scripts/build-demo.mjs`) et faire des captures 390×844 avec Playwright pour comparer à la maquette. Tester à la largeur d'un petit téléphone (360 px).
