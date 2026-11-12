// Après « expo export -p web » et « web-icons.mjs » : range le site pour GitHub Pages.
//   https://vitrineappli.fr/      → site de présentation (site/index.html)
//   https://vitrineappli.fr/app/  → l'appli web (tout ce qu'Expo a produit dans dist/)
//   /conditions/, /confidentialite/, /suppression/, /mentions-legales/ → pages légales (public/)
// L'ancienne adresse kelianjouini-byte.github.io/vitrine/… est renvoyée par GitHub vers vitrineappli.fr/… ;
// 404.html rattrape le reste : « /vitrine/… » perd ce préfixe, les vieux liens de l'appli (/abonnement…) vont sous /app/.
// CNAME : indique à GitHub Pages le nom de domaine du site.
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

if (!existsSync('dist/index.html')) throw new Error('dist/index.html absent : lancer « expo export -p web » avant.');
rmSync('.site-tmp', { recursive: true, force: true });
renameSync('dist', '.site-tmp');
mkdirSync('dist');
renameSync('.site-tmp', 'dist/app');

// Pages légales, icônes et feuille de style à la racine (adresses déjà données à Meta et Stripe).
cpSync('public', 'dist', { recursive: true });
cpSync('site', 'dist', { recursive: true });

// 404 = l'appli, pour les liens profonds (/app/abonnement…) ; tout le reste est renvoyé sous /app/.
const redirect = `<script>(function(){var p=location.pathname.replace(/^\\/vitrine(\\/|$)/,'/');if(p!=='/'&&p.indexOf('/app/')!==0&&p!=='/app'){p='/app/'+p.replace(/^\\//,'');}if(p!==location.pathname){location.replace(p+location.search+location.hash);}})();</script>`;
const app = readFileSync('dist/app/index.html', 'utf8');
writeFileSync('dist/404.html', app.replace('<head>', `<head>${redirect}`));
writeFileSync('dist/CNAME', 'vitrineappli.fr\n');
console.log('site rangé : présentation à la racine, appli dans /app');
