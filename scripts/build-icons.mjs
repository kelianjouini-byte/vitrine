// Génère les icônes de l'app (PNG) à partir du logo vectoriel « la boutique qui reçoit un j'aime ».
// Usage : node scripts/build-icons.mjs   (utilise Chromium via Playwright)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const GREEN = '#2F7658', ORANGE = '#F2B66D', WHITE = '#FFFFFF';
// Logo « la boutique qui reçoit un j'aime » (viewBox 120). fg = traits, bg = couleur du fond (découpe autour de la pastille).
const logo = ({ fg, bg, reflet = ORANGE, badge = ORANGE, heart = bg }) => `
  <rect x="10" y="34" width="84" height="7" rx="2.5" fill="${fg}"/>
  <path d="M10 40 H94 V46 Q83.5 58.6 73 46 Q62.5 58.6 52 46 Q41.5 58.6 31 46 Q20.5 58.6 10 46 Z" fill="${fg}"/>
  <rect x="16" y="66" width="48" height="38" rx="5" stroke="${fg}" stroke-width="6" fill="none"/>
  <path d="M26 94 L40 76 M38 96 L46 86" stroke="${reflet}" stroke-width="5" stroke-linecap="round"/>
  <path d="M72 106 V68 H88 V106" stroke="${fg}" stroke-width="6" stroke-linejoin="round" fill="none"/>
  <path d="M8 106 H96" stroke="${fg}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="96" cy="26" r="18" fill="${badge}" stroke="${bg}" stroke-width="5"/>
  <path d="M96 32.7 C88.4 27 86.5 23.2 86.5 20.4 A4.7 4.7 0 0 1 96 18.5 A4.7 4.7 0 0 1 105.5 20.4 C105.5 23.2 103.6 27 96 32.7 Z" fill="${heart}"/>`;
const onGreen = logo({ fg: WHITE, bg: GREEN });
const full = onGreen;
const color = logo({ fg: GREEN, bg: '#F8FAF7' });
// Monochrome Android : tout en blanc (la pastille devient un simple rond plein).
const mono = logo({ fg: WHITE, bg: 'none', reflet: WHITE, badge: WHITE, heart: 'none' });

// [fichier, taille, fond (ou null = transparent), contenu, part de la taille occupée par le logo]
const out = [
  ['icon.png', 1024, GREEN, onGreen, 0.72],
  ['android-icon-foreground.png', 512, null, onGreen, 0.5],
  ['android-icon-background.png', 512, GREEN, '', 0],
  ['android-icon-monochrome.png', 432, null, mono, 0.5],
  ['splash-icon.png', 1024, null, full, 1],
  ['favicon.png', 48, null, color, 1],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, bg, inner, scale] of out) {
  const m = size * scale, off = (size - m) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${bg ? `<rect width="100%" height="100%" fill="${bg}"/>` : ''}<svg x="${off}" y="${off}" width="${m}" height="${m}" viewBox="0 0 120 120">${inner}</svg></svg>`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.locator('svg').first().screenshot({ path: `assets/${file}`, omitBackground: true });
  console.log('ok', file);
}
await browser.close();
