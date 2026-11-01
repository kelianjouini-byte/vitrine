// Construit une page unique (HTML + JS intégré) pour essayer Vitrine dans un navigateur.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
const dir = 'dist/_expo/static/js/web/';
const js = readFileSync(dir + readdirSync(dir).find((f) => f.endsWith('.js')), 'utf8').replace(/<\/script/gi, '<\\/script');
const html = `<title>Vitrine</title>
<meta name="theme-color" content="#2F7658">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* Démo web de l'app Vitrine : un seul thème clair, volontairement (identité de marque). */
:root{--bg:#F8FAF7;color-scheme:light}
html,body{height:100%;margin:0;background:var(--bg)}body{overflow:hidden}#root{display:flex;height:100%;flex:1}
</style>
<noscript>Activez JavaScript pour utiliser Vitrine.</noscript>
<div id="root"></div>
<script>${js}</script>`;
mkdirSync('demo', { recursive: true });
writeFileSync('demo/index.html', html);
console.log('demo/index.html', (html.length / 1024).toFixed(0), 'Ko');
