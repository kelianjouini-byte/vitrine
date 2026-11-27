/**
 * E-mails de fin d'essai (décision de Kelian, 27 nov. 2026), sans dépendance (testés avec node --test).
 * - « reminder » : quelques jours avant la fin des 15 jours gratuits ;
 * - « ended »    : le jour où l'essai se termine.
 * Envoyés au créateur du compte (le patron), jamais aux employés, ni aux comptes payés ou offerts.
 * Le bouton ouvre l'appli web, où l'on choisit son offre (paiement Stripe sur le web).
 */
import { type Access, trialEndsAt } from './billing.ts';

export type TrialEmailKind = 'reminder' | 'ended';

const DAY = 86_400_000;
/** Rappel envoyé quand il reste 3 jours ou moins (la tâche tourne une fois par jour). */
export const REMINDER_DAYS = 3;
/** Pas de rappel s'il reste moins de 12 h : l'e-mail « essai terminé » arrive juste après. */
const REMINDER_MIN_LEFT = DAY / 2;
/** « Essai terminé » : seulement les 3 premiers jours, pour ne pas écrire aux vieux comptes oubliés. */
const ENDED_WINDOW = 3 * DAY;

/** Quel e-mail envoyer aujourd'hui à cette boutique (null = aucun). Les doublons sont bloqués par la table trial_emails. */
export function trialEmailDue(businessCreatedAt: string, access: Access, now = new Date()): TrialEmailKind | null {
  const left = trialEndsAt(businessCreatedAt).getTime() - now.getTime();
  if (access === 'trial') return left <= REMINDER_DAYS * DAY && left >= REMINDER_MIN_LEFT ? 'reminder' : null;
  if (access === 'expired') return -left <= ENDED_WINDOW ? 'ended' : null;
  return null; // payé ou offert
}

export interface TrialEmailData {
  firstName: string;
  businessName: string;
  businessCreatedAt: string;
  /** Posts et stories publiés pendant l'essai. */
  published: number;
  /** Vues sur Instagram + Facebook (0 si inconnues). */
  views: number;
  /** Offre fondateur encore ouverte avec des places. */
  founderLeft: number;
  appUrl: string;
}

export interface TrialEmail {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const nb = (n: number) => n.toLocaleString('fr-FR');

/** « lundi 30 novembre » (heure de Paris). */
export function frenchDay(d: Date): string {
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
}

export function daysLeft(businessCreatedAt: string, now = new Date()): number {
  return Math.max(1, Math.ceil((trialEndsAt(businessCreatedAt).getTime() - now.getTime()) / DAY));
}

function offers(founderLeft: number): string[] {
  const list = ['Mensuel : 39 € par mois, sans engagement', 'Annuel : 29 € par mois, engagement 1 an'];
  if (founderLeft > 0) list.unshift(`Offre fondateur : 29 € par mois, sans engagement (plus que ${founderLeft} place${founderLeft > 1 ? 's' : ''})`);
  return list;
}

function results(d: TrialEmailData): string | null {
  if (d.published <= 0) return null;
  const posts = `${nb(d.published)} publication${d.published > 1 ? 's' : ''}`;
  return d.views > 0 ? `Pendant votre essai : ${posts}, vues ${nb(d.views)} fois.` : `Pendant votre essai : ${posts}.`;
}

/** Texte des deux e-mails : phrases courtes, vouvoiement, aucune formule de vendeur. */
export function trialEmail(kind: TrialEmailKind, d: TrialEmailData, now = new Date()): TrialEmail {
  const hello = `Bonjour ${d.firstName.trim() || ''}`.trim() + ',';
  const end = frenchDay(trialEndsAt(d.businessCreatedAt));
  const n = daysLeft(d.businessCreatedAt, now);
  const subject = kind === 'reminder'
    ? `Votre essai Vitrine se termine dans ${n} jour${n > 1 ? 's' : ''}`
    : 'Votre essai Vitrine est terminé';
  const lines = kind === 'reminder'
    ? [`Votre essai gratuit de Vitrine pour ${d.businessName} se termine le ${end}.`]
    : [`Votre essai gratuit de 15 jours pour ${d.businessName} est terminé.`, 'Vos publications et vos réglages sont gardés.'];
  const res = results(d);
  if (res) lines.push(res);
  lines.push('Pour continuer, choisissez votre offre :');
  const list = offers(d.founderLeft);
  const button = 'Choisir mon offre';
  const after = 'Une question ? Répondez simplement à cet e-mail.';

  const text = [hello, '', ...lines, ...list.map((o) => `- ${o}`), '', `${button} : ${d.appUrl}`, '', after, '', 'Kelian, Vitrine'].join('\n');

  const p = (s: string) => `<p style="margin:0 0 14px">${esc(s)}</p>`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#F8FAF7">
<div style="max-width:520px;margin:0 auto;padding:28px 20px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:17px;line-height:1.5;color:#24332B">
<p style="margin:0 0 22px;font-family:Georgia,serif;font-size:26px;font-weight:bold;color:#2F7658">Vitrine</p>
<div style="background:#FFFFFF;border-radius:16px;padding:26px 22px">
${p(hello)}${lines.map(p).join('')}
<ul style="margin:0 0 22px;padding-left:20px">${list.map((o) => `<li style="margin:0 0 6px">${esc(o)}</li>`).join('')}</ul>
<p style="margin:0 0 6px;text-align:center"><a href="${esc(d.appUrl)}" style="display:inline-block;background:#2F7658;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:15px 28px;border-radius:12px">${button}</a></p>
</div>
<p style="margin:20px 0 4px;color:#758078;font-size:15px">${esc(after)}</p>
<p style="margin:0;color:#758078;font-size:15px">Kelian, Vitrine · vitrineappli.fr</p>
</div></body></html>`;
  return { subject, html, text };
}
