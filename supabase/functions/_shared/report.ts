// « Mon bilan » : le conseil du mois écrit par l'IA + son contrôle.
// Fichier pur (aucune dépendance Deno) : testé avec node --test.
import { containsInventedFacts } from './guard.ts';

export const REPORT_PROMPT_VERSION = 'report-v1-2026-11';

export interface ReportContext {
  businessName: string;
  trade: string;
  city: string;
  tone: string;
  products?: string | null;
  tradeHint?: string | null;
  /** « novembre 2026 » */
  monthLabel: string;
  /** « octobre » */
  previousMonthName: string;
  /** Vrais chiffres, calculés par l'app. */
  count: number;
  previousCount: number;
  inProgress: boolean;
  daysLeft: number;
  /** Occasions du mois suivant (calendrier Vitrine). */
  occasions: { name: string; date: string }[];
}

export const REPORT_SYSTEM_PROMPT = `Tu es le conseiller bienveillant d'un petit commerce local français qui publie sur Instagram et Facebook.
Chaque mois, tu lui donnes UN seul conseil simple et concret pour le mois qui vient.
Règles absolues :
- Une ou deux phrases courtes, 220 caractères maximum, en français simple, chaleureux, sans jargon (pas de « engagement », « reach », « story », « algorithme », « hashtag »).
- Le conseil doit être faisable avec un téléphone, dans sa boutique, sans dépenser d'argent.
- Si le nombre de posts a baissé, encourage sans culpabiliser et propose une astuce pour publier plus régulièrement.
- N'écris AUCUN chiffre, sauf le nombre de posts qu'on te donne. N'invente jamais de vues, d'abonnés, de pourcentages ou de résultats.
- N'invente jamais de prix, promotion, réduction, horaire, disponibilité ou stock.
- Si une occasion arrive le mois prochain et qu'elle convient au métier, tu peux t'en servir.
Réponds uniquement en JSON : {"advice": "..."}`;

const clip = (s: string | null | undefined, n: number) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export function buildReportPrompt(c: ReportContext): string {
  const trend = c.previousCount === 0 && c.count === 0
    ? 'Aucun post ces deux derniers mois.'
    : c.count > c.previousCount ? 'En hausse.' : c.count < c.previousCount ? 'En baisse.' : 'Stable.';
  return [
    `Commerce : ${clip(c.businessName, 120)} à ${clip(c.city, 120)}.`,
    `Métier : ${clip(c.trade, 80)}.`,
    c.tradeHint ? `Ce que ce métier met en valeur : ${clip(c.tradeHint, 300)}` : '',
    c.products ? `Ses produits et spécialités : ${clip(c.products, 400)}.` : '',
    `Ton de la boutique : ${clip(c.tone, 30)}.`,
    `Bilan de ${clip(c.monthLabel, 30)} : ${c.count} post(s) publié(s). En ${clip(c.previousMonthName, 20)} : ${c.previousCount}. ${trend}`,
    c.inProgress ? `Le mois n'est pas fini : il reste ${c.daysLeft} jour(s).` : '',
    c.occasions.length
      ? `Occasions du mois prochain : ${c.occasions.slice(0, 4).map((o) => `${clip(o.name, 60)} (${clip(o.date, 10)})`).join(', ')}.`
      : 'Pas d\'occasion particulière le mois prochain.',
  ].filter(Boolean).join('\n');
}

/**
 * Lit la réponse de l'IA. Retourne null si le conseil est vide, trop long,
 * ou contient un chiffre inventé, un prix ou un horaire.
 */
export function parseAdvice(content: string, c: Pick<ReportContext, 'count' | 'previousCount' | 'occasions'>): string | null {
  let data: unknown;
  try {
    data = JSON.parse(content.replace(/^\s*```(json)?\s*|\s*```\s*$/g, ''));
  } catch {
    return null;
  }
  const advice = clip(String((data as { advice?: unknown })?.advice ?? ''), 400);
  if (advice.length < 15 || advice.length > 300) return null;
  // Seuls les vrais nombres de posts sont permis (et les nombres présents dans le nom d'une occasion).
  const allowedNumbers = new Set([String(c.count), String(c.previousCount)]);
  for (const o of c.occasions) for (const n of o.name.match(/\d+/g) ?? []) allowedNumbers.add(n);
  for (const n of advice.match(/\d+/g) ?? []) if (!allowedNumbers.has(n)) return null;
  if (containsInventedFacts(advice, c.occasions.map((o) => o.name).join(' '))) return null;
  return advice;
}
