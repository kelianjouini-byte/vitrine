// Après « expo export -p web » : ajoute l'icône Vitrine pour « Sur l'écran d'accueil » (iPhone et Android).
// Les fichiers viennent de public/ (copiés tels quels dans dist/ par Expo).
// Pas de mode « plein écran » volontairement : sur iPhone, il séparerait les données de celles de Safari
// et le commerçant devrait recréer sa boutique.
import { readFileSync, writeFileSync } from 'node:fs';
const base = '/app';
const file = 'dist/index.html';
const tags = [
  `<link rel="apple-touch-icon" sizes="180x180" href="${base}/apple-touch-icon.png">`,
  `<link rel="manifest" href="${base}/manifest.json">`,
  '<meta name="apple-mobile-web-app-title" content="Vitrine">',
  // Polices de la marque : Fraunces (titres) et Inter (texte).
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">',
].join('');
const html = readFileSync(file, 'utf8');
if (!html.includes('apple-touch-icon')) writeFileSync(file, html.replace('</head>', `${tags}</head>`));
console.log('icônes écran d\'accueil ajoutées à', file);
