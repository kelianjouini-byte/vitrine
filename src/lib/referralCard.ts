/**
 * Parrainage : le lien, le message à envoyer et la page de cartes à imprimer (sans dépendance à l'appli,
 * pour pouvoir être testé avec node).
 */
import qrcode from 'qrcode-generator';

const APP = 'https://vitrineappli.fr/app';

/** Lien à partager : ouvre Vitrine et retient le code pour le moment du paiement. */
export function referralLink(code: string): string {
  return `${APP}/?parrain=${encodeURIComponent(code)}`;
}

/** Message déjà écrit, simple et sans formule commerciale. */
export function shareMessage(code: string): string {
  return `Bonjour, je voulais te parler de Vitrine, l'appli que j'utilise pour mes publications Instagram et Facebook. `
    + `Je prends une photo, elle écrit le texte et publie pour moi. Ça me fait gagner du temps, ça pourrait te rendre service aussi. `
    + `Tu peux l'essayer 15 jours gratuitement : ${referralLink(code)} . Si tu t'abonnes, mets mon code ${code}, tu auras 10 € de moins pendant 3 mois.`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** QR code (SVG) qui ouvre le lien de parrainage. */
export function qrSvg(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

/**
 * Page A4 de 10 cartes de visite (85 × 55 mm) à découper : code, QR code et les 3 étapes.
 * Une seule face, pour que l'impression soit simple sur n'importe quelle imprimante.
 */
export function printableCards(code: string, businessName: string): string {
  const qr = qrSvg(referralLink(code));
  const card = `
  <div class="card">
    <div class="glow"></div>
    <div class="left">
      <div class="logo"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8Z"/></svg>Vitrine</div>
      <div class="by">Recommandé par ${esc(businessName)}</div>
      <div class="code">${esc(code)}</div>
      <div class="gift">10 € de moins pendant 3 mois</div>
      <ol><li>Scannez le code</li><li>Essayez 15 jours gratuits</li><li>Au paiement, tapez le code</li></ol>
    </div>
    <div class="qr">${qr}</div>
  </div>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Mes cartes Vitrine</title>
<style>
@page{size:A4;margin:12mm}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.help{font-size:14px;color:#55615A;margin:0 0 6mm}
.grid{display:grid;grid-template-columns:85mm 85mm;gap:4mm;justify-content:center}
.card{width:85mm;height:55mm;border-radius:3mm;position:relative;overflow:hidden;padding:4.5mm 5mm;color:#fff;display:flex;gap:3mm;
  background:#2F7658;background-image:linear-gradient(150deg,#3A8463,#1F5F45);outline:0.2mm dashed #B9C4BC;outline-offset:1.5mm}
.glow{position:absolute;right:-12mm;top:-12mm;width:40mm;height:40mm;border-radius:50%;background:radial-gradient(circle,rgba(242,182,109,.55),transparent 65%)}
.left{flex:1;position:relative;min-width:0}
.logo{display:flex;align-items:center;gap:2mm;font-family:Georgia,serif;font-size:15px;font-weight:700}
.by{font-size:9px;opacity:.9;margin-top:1.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.code{font-family:Georgia,serif;font-size:15px;font-weight:700;letter-spacing:.6px;color:#FCEFD9;margin-top:2mm;white-space:nowrap}
.gift{font-size:8.5px;opacity:.95}
ol{font-size:8px;line-height:1.45;margin:2mm 0 0 3.2mm;opacity:.95}
.qr{position:relative;align-self:flex-end;width:26mm;height:26mm;background:#fff;border-radius:2mm;padding:1.6mm;flex:none}
.qr svg{width:100%;height:100%;display:block}
.qr svg path,.qr svg rect[fill="black"],.qr svg rect[fill="#000000"]{fill:#1F5F45}
@media screen{body{padding:8mm}}
@media print{.help{display:none}}
</style></head><body>
<p class="help">Imprimez cette page, puis découpez les cartes en suivant les pointillés. À donner aux commerçants que vous connaissez.</p>
<div class="grid">${Array.from({ length: 10 }, () => card).join('')}</div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`;
}
