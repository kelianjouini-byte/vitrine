/**
 * Parrainage entre commerçants, règles sans dépendance (testées avec node --test).
 * Décision de Kelian (9 nov. 2026) :
 *  - le filleul tape le code du parrain AU MOMENT DE PAYER (pas à l'inscription) ;
 *  - filleul : 10 € de moins pendant ses 3 premiers mois payés ;
 *  - parrain : 10 € de moins chaque mois, pour chaque filleul qui paie, tant qu'il reste abonné ;
 *    on s'arrête à 0 € (on ne doit jamais d'argent au parrain) ;
 *  - rien n'est donné tant que le filleul n'a pas vraiment payé (c'est Stripe qui le confirme) ;
 *  - pas de « s'auto-parrainer » : même carte, même adresse ou même nom sur la facture = pas de réduction.
 */

export const REFEREE_DISCOUNT_CENTS = 1000;
export const REFEREE_DISCOUNT_MONTHS = 3;
export const REFERRER_CREDIT_CENTS = 1000;

/** Lettres et chiffres du code, sans ceux qui se confondent (O/0, I/1/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_RANDOM_LENGTH = 5;

/** Début du code, facile à reconnaître : le 1er mot du nom de la boutique, sans accents (« Fleurs de Marie » -> FLEURS). */
export function codePrefix(businessName: string): string {
  const words = businessName
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((w) => w.length >= 3 && !['LES', 'DES', 'AUX', 'CHEZ', 'MAISON', 'BOUTIQUE'].includes(w));
  const w = words[0] ?? '';
  return w ? w.slice(0, 6) : 'VITRINE';
}

/** Un code comme FLEURS-7K4Q9. random() renvoie un nombre dans [0, 1[ (crypto côté serveur). */
export function makeCode(businessName: string, random: () => number): string {
  let tail = '';
  for (let i = 0; i < CODE_RANDOM_LENGTH; i++) tail += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return `${codePrefix(businessName)}-${tail}`;
}

/** Code tapé par le commerçant -> forme rangée en base (majuscules, tiret normal, sans espaces). */
export function normalizeCode(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[\u2010-\u2015_.]/g, '-')
    .replace(/\s+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Forme attendue avant même d'interroger la base (évite les requêtes inutiles). */
export function looksLikeCode(code: string): boolean {
  return new RegExp(`^[A-Z]{3,7}-[${CODE_ALPHABET}]{${CODE_RANDOM_LENGTH}}$`).test(code);
}

/**
 * Crédit à donner au parrain pour un mois payé par un filleul.
 * currentCreditCents : le crédit qu'il a déjà en réserve chez Stripe. On ne dépasse jamais le prix d'un mois :
 * avec 3 filleuls à 29 €, le parrain ne paie plus rien, mais on ne lui doit rien en plus.
 */
export function referrerCredit(currentCreditCents: number, monthlyPriceCents: number): number {
  const room = Math.max(0, monthlyPriceCents - Math.max(0, currentCreditCents));
  return Math.min(REFERRER_CREDIT_CENTS, room);
}

/** Prix par mois du parrain avec ses filleuls qui paient (affichage). Jamais en dessous de 0. */
export function priceWithReferrals(monthlyPriceCents: number, payingReferrals: number): number {
  return Math.max(0, monthlyPriceCents - payingReferrals * REFERRER_CREDIT_CENTS);
}

/** Nombre de filleuls payants qu'il manque pour que Vitrine soit gratuite. */
export function referralsUntilFree(monthlyPriceCents: number, payingReferrals: number): number {
  return Math.max(0, Math.ceil(monthlyPriceCents / REFERRER_CREDIT_CENTS) - payingReferrals);
}

/** Ce que Stripe sait de qui paie : carte, adresse et nom sur la facture. */
export interface Payer {
  cardFingerprint?: string | null;
  name?: string | null;
  address?: { line1?: string | null; postal_code?: string | null } | null;
}

const simple = (s?: string | null) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * La même personne derrière le parrain et le filleul ? (ex. un commerçant qui a deux boutiques)
 * Renvoie la raison, ou null si rien ne se ressemble.
 */
export function samePayer(a: Payer, b: Payer): 'card' | 'address' | 'name' | null {
  if (a.cardFingerprint && a.cardFingerprint === b.cardFingerprint) return 'card';
  const addrA = simple(a.address?.line1) + '|' + simple(a.address?.postal_code);
  const addrB = simple(b.address?.line1) + '|' + simple(b.address?.postal_code);
  if (simple(a.address?.line1) && addrA === addrB) return 'address';
  if (simple(a.name).length >= 4 && simple(a.name) === simple(b.name)) return 'name';
  return null;
}
