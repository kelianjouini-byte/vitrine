// Contrôles « l'IA n'invente rien » — fichier pur (aucune dépendance Deno), testé avec node --test.

const PRICE_PATTERN = /(\d+[.,]?\d*\s?(€|euros?)|-\s?\d+\s?%|\d+\s?%\s?(de réduction|offerts?)|promo(tion)?s?\b|soldes?\b|gratuit)/i;
/** Horaires et ouvertures précises (« de 9h à 18h », « ouvert dimanche »). */
const HOURS_PATTERN = /(\b\d{1,2}\s?h\s?\d{0,2}\b|\bouvert(e|s)?\s+(le|les|ce|tous|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\b|\bhoraires?\b)/i;

/** Refuse un texte qui contient un prix / une promo que le commerçant n'a pas donné. */
export function containsInventedCommercialInfo(text: string, merchantNote: string): boolean {
  return PRICE_PATTERN.test(text) && !PRICE_PATTERN.test(merchantNote);
}

/**
 * Pour les idées : ni prix, ni promo, ni horaire. Seule exception : le mot « soldes » quand les soldes
 * sont une occasion du calendrier (texte autorisé). Un prix ou un pourcentage reste toujours refusé.
 */
export function containsInventedFacts(text: string, allowed: string): boolean {
  const t = /soldes?/i.test(allowed) ? text.replace(/soldes?/gi, '') : text;
  return PRICE_PATTERN.test(t) || HOURS_PATTERN.test(t);
}
