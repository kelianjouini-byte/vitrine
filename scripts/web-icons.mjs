// Après « expo export -p web » : ajoute l'icône Vitrine pour « Sur l'écran d'accueil » (iPhone et Android).
// Les fichiers viennent de public/ (copiés tels quels dans dist/ par Expo).
// Pas de mode « plein écran » volontairement : sur iPhone, il séparerait les données de celles de Safari
// et le commerçant devrait recréer sa boutique.
import { readFileSync, writeFileSync } from 'node:fs';
const base = '/vitrine';
const file = 'dist/index.html';
const tags = [
  `<link rel="apple-touch-icon" sizes="180x180" href="${base}/apple-touch-icon.png">`,
  `<link rel="manifest" href="${base}/manifest.json">`,
  '<meta name="apple-mobile-web-app-title" content="Vitrine">',
].join('');
const html = readFileSync(file, 'utf8');
if (!html.includes('apple-touch-icon')) writeFileSync(file, html.replace('</head>', `${tags}</head>`));
console.log('icônes écran d\'accueil ajoutées à', file);
