/**
 * Équipe et plusieurs boutiques : règles sans dépendance (testées avec node --test).
 * Décisions de Kelian (9 nov. 2026) :
 *  - 2 rôles : « patron » (tout, comme le créateur du compte) et « employé » (prépare, un patron valide) ;
 *  - un patron peut laisser un employé « publier seul » ;
 *  - l'employé se connecte avec son e-mail + un code donné par le patron (6 caractères, facile à dicter) ;
 *  - 1re boutique au prix de l'offre, chaque boutique en plus 19 € (mensuel) / 15 € (annuel), employés gratuits.
 */

export type Role = 'owner' | 'patron' | 'employe';

/** Lettres et chiffres faciles à dicter (sans O/0, I/1/L). */
export const LOGIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** 6 caractères : le minimum de Supabase pour un mot de passe, et encore facile à donner de vive voix. */
export const LOGIN_CODE_LENGTH = 6;
/** Après 5 codes faux en 15 minutes, on bloque cette adresse 15 minutes. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

/** Un code comme 4K7Q2M. random() renvoie un nombre dans [0, 1[ (crypto côté serveur). */
export function makeLoginCode(random: () => number): string {
  let out = '';
  for (let i = 0; i < LOGIN_CODE_LENGTH; i++) out += LOGIN_CODE_ALPHABET[Math.floor(random() * LOGIN_CODE_ALPHABET.length)];
  return out;
}

/** Code tapé par l'employé -> forme rangée (majuscules, sans espaces ni tirets). */
export function normalizeLoginCode(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input.toUpperCase().replace(/[\s\-_.]/g, '');
}

export function looksLikeLoginCode(code: string): boolean {
  return new RegExp(`^[${LOGIN_CODE_ALPHABET}]{${LOGIN_CODE_LENGTH}}$`).test(code);
}

/** Comparaison en temps constant (on ne laisse pas deviner le code à la vitesse de la réponse). */
export function sameCode(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Trop d'erreurs récentes pour cette adresse ? failures = nombre d'échecs depuis LOCK_MINUTES. */
export function isLockedOut(failures: number): boolean {
  return failures >= MAX_FAILED_LOGINS;
}

export function normalizeEmail(input: unknown): string {
  return typeof input === 'string' ? input.trim().toLowerCase() : '';
}

export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 200;
}

/** Le patron (créateur ou patron ajouté) décide de tout : abonnement, équipe, boutiques, validation. */
export function isPatron(role: Role): boolean {
  return role === 'owner' || role === 'patron';
}

/** Peut publier directement : un patron, ou un employé à qui un patron a dit « Publie seul ». */
export function canPublishDirectly(role: Role, canPublish: boolean): boolean {
  return isPatron(role) || canPublish;
}

/** Boutiques d'un membre : un patron voit tout ; un employé, ses boutiques (liste vide = toutes). */
export function memberShopIds(role: Role, shopIds: string[], allShopIds: string[]): string[] {
  if (isPatron(role) || !shopIds.length) return allShopIds;
  return allShopIds.filter((id) => shopIds.includes(id));
}

/** Prix par mois d'une entreprise : 1re boutique au prix de l'offre, puis le prix « boutique en plus ». */
export function companyMonthlyCents(planCents: number, extraShopCents: number, shopCount: number): number {
  return planCents + Math.max(0, shopCount - 1) * extraShopCents;
}

/** « Julie », « Julie et Thomas », « Julie, Thomas et Sophie ». */
export function namesList(names: string[]): string {
  const u = [...new Set(names)];
  if (u.length <= 1) return u[0] ?? '';
  return `${u.slice(0, -1).join(', ')} et ${u[u.length - 1]}`;
}

/** Libellé des boutiques d'un employé (« Toutes les boutiques », « Aix et Marseille »). */
export function shopsLabel(ids: string[], shops: { id?: string; city: string; businessName: string }[]): string {
  if (!ids.length) return shops.length > 1 ? 'Toutes les boutiques' : shops[0]?.businessName ?? '';
  const mine = shops.filter((s) => s.id && ids.includes(s.id));
  // Sa seule boutique a été retirée : il n'a plus accès à rien tant que le patron ne lui en redonne pas une.
  if (!mine.length) return 'Aucune boutique';
  if (mine.length >= shops.length) return shops.length > 1 ? 'Toutes les boutiques' : shops[0]?.businessName ?? '';
  return namesList(mine.map((s) => s.city || s.businessName));
}
