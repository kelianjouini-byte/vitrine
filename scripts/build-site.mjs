// Après « expo export -p web » et « web-icons.mjs » : range le site pour GitHub Pages.
//   /vitrine/            → site de présentation (site/index.html)
//   /vitrine/app/        → l'appli web (tout ce qu'Expo a produit dans dist/)
//   /vitrine/conditions/, /confidentialite/, /suppression/, /mentions-legales/ → pages légales (public/), à leur adresse habituelle
// Les anciens liens de l'appli (…/vitrine/abonnement, …/vitrine/meta-connected) sont renvoyés vers /vitrine/app/… par 404.html.
// Même adresse de site (même « origine ») : les données gardées dans le navigateur restent les mêmes pour l'appli.
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

if (!existsSync('dist/index.html')) throw new Error('dist/index.html absent : lancer « expo export -p web » avant.');
rmSync('.site-tmp', { recursive: true, force: true });
renameSync('dist', '.site-tmp');
mkdirSync('dist');
renameSync('.site-tmp', 'dist/app');

// Pages légales, icônes et feuille de style à la racine (adresses déjà données à Meta et Stripe).
cpSync('public', 'dist', { recursive: true });
cpSync('site', 'dist', { recursive: true });

// 404 = l'appli, pour les liens profonds (/vitrine/app/abonnement…) ; tout le reste est renvoyé sous /vitrine/app/.
const redirect = `<script>(function(){var p=location.pathname;if(p.indexOf('/vitrine/app/')!==0&&p!=='/vitrine/app'){location.replace('/vitrine/app/'+p.replace(/^\\/vitrine\\/?/,'')+location.search+location.hash);}})();</script>`;
const app = readFileSync('dist/app/index.html', 'utf8');
writeFileSync('dist/404.html', app.replace('<head>', `<head>${redirect}`));
console.log('site rangé : présentation à la racine, appli dans /app');
