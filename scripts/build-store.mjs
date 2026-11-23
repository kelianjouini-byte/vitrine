/**
 * Prépare le contenu des applis App Store et Google Play (dossier dist-store/),
 * puis le copie dans les projets iPhone (ios/) et Android (android/).
 *   node scripts/build-store.mjs
 * C'est la même appli que le site vitrineappli.fr/app, rangée à la racine, avec deux réglages en plus :
 * l'écran va jusque sous l'encoche de l'iPhone (viewport-fit=cover) et la langue est le français.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });

rmSync('dist-store', { recursive: true, force: true });
run('npx expo export -p web --output-dir dist-store', { VITRINE_STORE_APP: '1' });

const file = 'dist-store/index.html';
let html = readFileSync(file, 'utf8');
html = html
  .replace('<html lang="en">', '<html lang="fr">')
  .replace(/<meta name="viewport" content="[^"]*"\s*\/?>/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />');
if (!html.includes('viewport-fit=cover')) throw new Error('index.html : balise viewport introuvable');
writeFileSync(file, html);

if (!process.argv.includes('--no-sync')) run('npx cap sync');
