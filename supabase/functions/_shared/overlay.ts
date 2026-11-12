// Petit texte écrit SUR la photo ou la vidéo (Reel, story) : consigne de l'IA et lecture de sa réponse.
// Fichier pur (aucune dépendance Deno) : testé avec node --test.
import { containsInventedCommercialInfo } from './guard.ts';
import { findAdWords } from './prompts.ts';

/** Le texte posé sur l'image : court, pour être lu en une seconde. */
export const OVERLAY_MAX_CHARS = 42;
export const OVERLAY_MAX_WORDS = 7;

export const OVERLAY_SYSTEM_PROMPT = `Tu écris le petit texte posé en gros SUR une photo ou une vidéo verticale d'un petit commerce français (story ou vidéo courte Instagram et Facebook).

RÈGLES
- Une seule phrase courte, de 2 à ${OVERLAY_MAX_WORDS} mots, ${OVERLAY_MAX_CHARS} caractères au maximum. Elle doit se lire en une seconde.
- Elle dit ce que l'on voit ou l'envie que ça donne, avec des mots simples et concrets. Exemples de ton : « Tout juste sortis du four », « Les pivoines sont arrivées », « Prêt pour ce soir ? ».
- En français, sans hashtag, sans emoji dans la phrase, sans guillemets, sans point final.
- Jamais de prix, de promotion, de réduction, d'horaire ni de disponibilité inventés. Si le commerçant en donne, tu peux les reprendre tels quels.
- Pas de mots publicitaires (« incontournable », « sublime », « exceptionnel », « découvrez », « ne ratez pas »...).
- Propose aussi 4 emojis différents qui vont bien avec la photo et la phrase (le premier est le meilleur).

FORMAT DE RÉPONSE
Réponds uniquement en JSON : {"text": "la phrase", "emojis": ["🥐", "🔥", "✨", "☀️"]}`;

export interface OverlayOutput {
  text: string;
  emojis: string[];
}

/** Un emoji « simple » : une seule image (avec ses éventuels modificateurs), rien d'autre. */
const EMOJI = /^(\p{Extended_Pictographic}|\p{Regional_Indicator})(\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|️|‍|⃣)*$/u;
const ANY_EMOJI = /(\p{Extended_Pictographic}|\p{Regional_Indicator})(\p{Emoji_Modifier}|️|‍\p{Extended_Pictographic})*/gu;

/** Nettoie la phrase : sans emoji, sans hashtag, sans guillemets ni point final, majuscule au début. */
export function cleanOverlayText(raw: string): string {
  let t = raw
    .replace(ANY_EMOJI, ' ')
    .replace(/#\S+/g, ' ')
    .replace(/["«»“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.。]+$/, '')
    .trim();
  if (t) t = t[0].toLocaleUpperCase('fr-FR') + t.slice(1);
  return t;
}

/**
 * Lit la réponse de l'IA. Retourne null si la phrase est inutilisable (vide, trop longue,
 * prix inventé, mot publicitaire) : on demande alors une autre réponse.
 */
export function parseOverlay(content: string, merchantNote = ''): OverlayOutput | null {
  let raw: unknown;
  try {
    const cleaned = content.replace(/^\s*```(json)?\s*|\s*```\s*$/g, '').trim();
    raw = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = cleanOverlayText(typeof r.text === 'string' ? r.text : '');
  const words = text.split(/\s+/).filter(Boolean).length;
  if (text.length < 3 || text.length > OVERLAY_MAX_CHARS || words > OVERLAY_MAX_WORDS) return null;
  if (containsInventedCommercialInfo(text, merchantNote) || findAdWords(text).length) return null;
  const emojis = [...new Set((Array.isArray(r.emojis) ? r.emojis : []).map((e) => String(e).trim()).filter((e) => EMOJI.test(e)))].slice(0, 4);
  return { text, emojis };
}
