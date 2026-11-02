// Génère les icônes de l'app (PNG) à partir du logo vectoriel « La devanture ».
// Usage : node scripts/build-icons.mjs   (utilise Chromium via Playwright)
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');

const GREEN = '#2F7658', DARK = '#1F5F45', SOFT = '#DCEFE3', MID = '#A9D4BC', ORANGE = '#F2B66D', WHITE = '#FFFFFF';
const spark = (fill) => `<path d="M60 70 Q62.5 81 73 84 Q62.5 87 60 98 Q57.5 87 47 84 Q57.5 81 60 70 Z" fill="${fill}"/>`;
// Version simplifiée (3 rayures) : lisible à toutes les tailles d'icône.
const simple = ({ bar, s1, s2, win, winFill = 'none', sp }) => `
  <rect x="12" y="16" width="96" height="14" rx="5" fill="${bar}"/>
  <path d="M12 30 H44 V42 A16 16 0 0 1 12 42 Z" fill="${s1}"/>
  <path d="M44 30 H76 V42 A16 16 0 0 1 44 42 Z" fill="${s2}"/>
  <path d="M76 30 H108 V42 A16 16 0 0 1 76 42 Z" fill="${s1}"/>
  <rect x="22" y="64" width="76" height="40" rx="8" fill="${winFill}" stroke="${win}" stroke-width="8"/>${spark(sp)}`;
// Version complète (4 rayures + reflet) : écran d'ouverture.
const full = `
  <rect x="12" y="16" width="96" height="14" rx="5" fill="${WHITE}"/>
  <path d="M12 30 H36 V44 A12 12 0 0 1 12 44 Z" fill="${WHITE}"/><path d="M36 30 H60 V44 A12 12 0 0 1 36 44 Z" fill="${MID}"/>
  <path d="M60 30 H84 V44 A12 12 0 0 1 60 44 Z" fill="${WHITE}"/><path d="M84 30 H108 V44 A12 12 0 0 1 84 44 Z" fill="${MID}"/>
  <rect x="22" y="61" width="76" height="43" rx="8" fill="none" stroke="${WHITE}" stroke-width="6"/>
  <path d="M34 92 L50 70" stroke="${WHITE}" stroke-width="5" stroke-linecap="round"/><path d="M46 94 L56 80" stroke="${WHITE}" stroke-width="4" stroke-linecap="round"/>
  <path d="M78 62 Q80 70 88 72 Q80 74 78 82 Q76 74 68 72 Q76 70 78 62 Z" fill="${ORANGE}"/>`;
const onGreen = simple({ bar: WHITE, s1: WHITE, s2: MID, win: WHITE, sp: ORANGE });
const color = simple({ bar: DARK, s1: GREEN, s2: MID, win: GREEN, winFill: SOFT, sp: ORANGE });
const mono = simple({ bar: WHITE, s1: WHITE, s2: WHITE, win: WHITE, sp: WHITE });

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
