// E-mails de fin d'essai gratuit (texte et mise en page). Fonctions pures, testées dans tests/trialEmail.test.ts.
// Ces e-mails portent l'offre et les liens de paiement : dans les applis App Store / Google Play,
// Vitrine ne montre ni prix ni bouton de paiement (règles d'Apple et de Google), seulement « regardez vos e-mails ».

export type TrialEmailKind = 'soon' | 'ended' | 'resend';

export interface EmailOffer {
  name: string;
  /** Prix par mois, en centimes. */
  priceCents: number;
  /** Une ligne sous le prix (« Sans engagement », « Engagement 1 an »…). */
  detail: string;
  /** Lien qui ouvre directement la page de paiement Stripe pour cette offre. */
  url: string;
  highlight?: boolean;
}

export interface TrialEmailInput {
  kind: TrialEmailKind;
  shopName: string;
  firstName?: string | null;
  /** Fin de l'essai gratuit. */
  trialEnd: Date;
  now?: Date;
  offers: EmailOffer[];
}

const euros = (cents: number) => `${(cents / 100).toLocaleString('fr-FR', { minimumFractionDigits: cents % 100 ? 2 : 0 })} €`;
const frDate = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
/** « Choisir l'offre Mensuel », « Choisir l'offre fondateur ». */
export const buttonLabel = (name: string) => /^offre /i.test(name) ? `Choisir l'${name.charAt(0).toLowerCase()}${name.slice(1)}` : `Choisir l'offre ${name}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function trialEmailSubject(i: TrialEmailInput): string {
  const now = i.now ?? new Date();
  if (i.trialEnd > now) return `Votre essai Vitrine se termine ${frDate(i.trialEnd)}`;
  return 'Votre essai Vitrine est terminé : votre boutique vous attend';
}

function intro(i: TrialEmailInput): string {
  const now = i.now ?? new Date();
  if (i.trialEnd > now) {
    return `Votre essai gratuit de Vitrine pour ${i.shopName} se termine ${frDate(i.trialEnd)}. Pour continuer à publier sans interruption, choisissez votre offre ci-dessous. Vous ne payez rien avant la fin de l'essai.`;
  }
  return `Votre essai gratuit de Vitrine pour ${i.shopName} est terminé. Votre boutique, vos photos et vos posts sont gardés : choisissez votre offre ci-dessous, et l'appli se rouvre aussitôt.`;
}

/** Version texte (pour les messageries qui n'affichent pas la mise en page). */
export function trialEmailText(i: TrialEmailInput): string {
  const hello = i.firstName ? `Bonjour ${i.firstName},` : 'Bonjour,';
  const offers = i.offers.map((o) => `- ${o.name} : ${euros(o.priceCents)} par mois. ${o.detail}\n  ${o.url}`).join('\n');
  return [
    hello, '', intro(i), '', offers, '',
    "Après le paiement, rouvrez simplement l'appli Vitrine : elle se débloque toute seule.",
    'Une question ? Répondez à cet e-mail, nous vous aidons.', '',
    "L'équipe Vitrine", 'TVA non applicable, art. 293 B du CGI.',
  ].join('\n');
}

/** Version mise en page (HTML simple, lisible sur téléphone, couleurs de Vitrine). */
export function trialEmailHtml(i: TrialEmailInput): string {
  const hello = i.firstName ? `Bonjour ${esc(i.firstName)},` : 'Bonjour,';
  const cards = i.offers.map((o) => `
    <tr><td style="padding:8px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:${o.highlight ? '2px solid #2F7658' : '1px solid #DCE3DE'};border-radius:14px;background:#FFFFFF">
        <tr><td style="padding:18px 20px">
          <div style="font-size:18px;font-weight:700;color:#24332B">${esc(o.name)}</div>
          <div style="font-size:28px;font-weight:700;color:#2F7658;margin:4px 0">${euros(o.priceCents)}<span style="font-size:16px;font-weight:400;color:#758078"> par mois</span></div>
          <div style="font-size:15px;color:#758078;margin-bottom:14px">${esc(o.detail)}</div>
          <a href="${esc(o.url)}" style="display:block;text-align:center;background:#2F7658;color:#FFFFFF;text-decoration:none;font-size:18px;font-weight:700;padding:16px;border-radius:12px">${esc(buttonLabel(o.name))}</a>
        </td></tr>
      </table>
    </td></tr>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F8FAF7;font-family:Helvetica,Arial,sans-serif;color:#24332B">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
      <tr><td style="font-family:Georgia,serif;font-size:26px;font-weight:700;color:#2F7658;padding-bottom:16px">Vitrine</td></tr>
      <tr><td style="font-size:17px;line-height:1.5;padding-bottom:8px">${hello}</td></tr>
      <tr><td style="font-size:17px;line-height:1.5;padding-bottom:12px">${esc(intro(i))}</td></tr>
      ${cards}
      <tr><td style="font-size:16px;line-height:1.5;padding-top:12px">Après le paiement, rouvrez simplement l'appli Vitrine : elle se débloque toute seule.</td></tr>
      <tr><td style="font-size:16px;line-height:1.5;padding-top:8px">Une question ? Répondez à cet e-mail, nous vous aidons.</td></tr>
      <tr><td style="font-size:16px;padding-top:16px">L'équipe Vitrine</td></tr>
      <tr><td style="font-size:13px;color:#758078;padding-top:20px">Paiement sécurisé par carte bancaire avec Stripe. TVA non applicable, art. 293 B du CGI.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Quel e-mail automatique envoyer aujourd'hui (null = aucun). daysBefore = jours avant la fin pour le rappel. */
export function dueTrialEmail(trialEnd: Date, now: Date, daysBefore = 3): 'soon' | 'ended' | null {
  const ms = trialEnd.getTime() - now.getTime();
  const day = 86_400_000;
  if (ms > 0 && ms <= daysBefore * day) return 'soon';
  // Essai terminé depuis moins de 10 jours : un seul e-mail (au-delà, on n'écrit plus).
  if (ms <= 0 && ms > -10 * day) return 'ended';
  return null;
}
