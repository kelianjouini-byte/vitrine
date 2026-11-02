/**
 * Calendrier commercial français.
 *
 * Toutes les dates mobiles sont CALCULÉES pour chaque année (Pâques, fête des mères,
 * soldes...). Aucune date n'est codée en dur pour une année précise.
 * Ce fichier est volontairement « pur » (aucune dépendance React Native) pour être
 * testé facilement et réutilisé côté serveur (Edge Functions).
 */
import type { BusinessType } from './types';

export type EventCategory = 'fete' | 'religieux' | 'commercial' | 'saison' | 'soldes';

export interface CommercialEvent {
  /** Identifiant unique : clé + année (ex. « noel-2026 »). */
  id: string;
  /** Clé stable d'une année sur l'autre (ex. « noel »). */
  key: string;
  name: string;
  date: Date;
  /** Dernier jour pour les événements qui durent (soldes). */
  endDate?: Date;
  category: EventCategory;
  emoji: string;
  description: string;
  /** Combien de jours avant faut-il prévenir le commerçant. */
  notifyDaysBefore: number;
  /** Idée de publication proposée au commerçant. */
  strategy: string;
  /** Métiers pour lesquels l'occasion est pertinente. 'all' = tout le monde. */
  relevantFor: BusinessType[] | 'all';
  /** Remarque éventuelle (exceptions territoriales...). */
  note?: string;
}

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const addDays = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/** Dimanche de Pâques (algorithme de Meeus / Jones / Butcher, calendrier grégorien). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const dd = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - dd - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return d(year, month, day);
}

/** n-ième jour de semaine (0 = dimanche) d'un mois. n = -1 pour le dernier. */
export function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  if (n > 0) {
    const first = d(year, month, 1);
    const offset = (weekday - first.getDay() + 7) % 7;
    return d(year, month, 1 + offset + (n - 1) * 7);
  }
  const last = d(year, month + 1, 0);
  const offset = (last.getDay() - weekday + 7) % 7;
  return addDays(last, -offset);
}

/** Fête des mères : dernier dimanche de mai, décalée au 1er dimanche de juin si c'est la Pentecôte. */
export function mothersDay(year: number): Date {
  const lastSundayMay = nthWeekday(year, 5, 0, -1);
  const pentecost = addDays(easterSunday(year), 49);
  return sameDay(lastSundayMay, pentecost) ? nthWeekday(year, 6, 0, 1) : lastSundayMay;
}

/** Épiphanie en France : dimanche entre le 2 et le 8 janvier. */
export function epiphany(year: number): Date {
  return nthWeekday(year, 1, 0, 1).getDate() === 1 ? d(year, 1, 8) : nthWeekday(year, 1, 0, 1);
}

/**
 * Soldes d'hiver (règle nationale depuis 2020, Code de commerce art. D310-15-2) :
 * 2e mercredi de janvier, avancé au 1er mercredi si le 2e tombe après le 12. Durée : 4 semaines.
 */
export function winterSales(year: number): { start: Date; end: Date } {
  let start = nthWeekday(year, 1, 3, 2);
  if (start.getDate() > 12) start = nthWeekday(year, 1, 3, 1);
  return { start, end: addDays(start, 27) };
}

/**
 * Soldes d'été : dernier mercredi de juin, avancé à l'avant-dernier si après le 28. Durée : 4 semaines.
 */
export function summerSales(year: number): { start: Date; end: Date } {
  let start = nthWeekday(year, 6, 3, -1);
  if (start.getDate() > 28) start = addDays(start, -7);
  return { start, end: addDays(start, 27) };
}

/**
 * Exceptions territoriales connues pour les soldes. Elles changent parfois par arrêté :
 * à vérifier chaque année (et à déplacer dans la table `commercial_events` côté serveur).
 */
const SALES_TERRITORY_NOTES: { prefixes: string[]; note: string }[] = [
  { prefixes: ['06'], note: "Alpes-Maritimes : les soldes d'été commencent en général début juillet." },
  { prefixes: ['20'], note: "Corse : les soldes d'été commencent en général mi-juillet." },
  { prefixes: ['54', '55', '57', '88'], note: "Lorraine : les soldes d'hiver commencent en général le 2 janvier." },
  { prefixes: ['971', '972', '973', '974', '975', '976'], note: "Outre-mer : les dates des soldes sont fixées localement." },
];

export function salesNoteFor(postalCode?: string): string | undefined {
  if (!postalCode) return undefined;
  return SALES_TERRITORY_NOTES.find((t) => t.prefixes.some((p) => postalCode.startsWith(p)))?.note;
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const FOOD: BusinessType[] = ['boulangerie', 'patisserie', 'chocolatier', 'epicerie', 'restaurant', 'caviste', 'traiteur'];
const FRESH: BusinessType[] = ['boucherie', 'poissonnerie', 'fromagerie', 'primeur'];
const GIFTS: BusinessType[] = ['fleuriste', 'chocolatier', 'patisserie', 'beaute', 'vetements', 'artisan', 'caviste', 'coiffure', 'bijouterie', 'cadeaux', 'chaussures', 'onglerie', 'librairie', 'epicerie'];
const RETAIL: BusinessType[] = ['vetements', 'chaussures', 'artisan', 'epicerie', 'beaute', 'bijouterie', 'cadeaux', 'jouets', 'opticien', 'jardinerie', 'autre'];
const SALES: BusinessType[] = ['vetements', 'chaussures', 'artisan', 'beaute', 'bijouterie', 'cadeaux'];
const BOOKINGS: BusinessType[] = ['coiffure', 'barbier', 'beaute', 'onglerie'];

/** Toutes les occasions d'une année civile. */
export function eventsForYear(year: number, postalCode?: string): CommercialEvent[] {
  const easter = easterSunday(year);
  const winter = winterSales(year);
  const summer = summerSales(year);
  const blackFriday = addDays(nthWeekday(year, 11, 4, 4), 1);
  const salesNote = salesNoteFor(postalCode);

  const list: Omit<CommercialEvent, 'id' | 'key'>[] = [
    { name: 'Nouvel An', date: d(year, 1, 1), category: 'fete', emoji: '🥂', description: 'Souhaitez une belle année à vos clients.', notifyDaysBefore: 3, strategy: 'Une photo de votre boutique et un mot de remerciement.', relevantFor: 'all' },
    { name: 'Épiphanie', date: epiphany(year), category: 'religieux', emoji: '👑', description: 'Le temps des galettes des rois.', notifyDaysBefore: 7, strategy: 'Montrez vos galettes et vos fèves.', relevantFor: ['boulangerie', 'patisserie', 'traiteur'] },
    { name: "Soldes d'hiver", date: winter.start, endDate: winter.end, category: 'soldes', emoji: '🏷️', description: '4 semaines de soldes.', notifyDaysBefore: 5, strategy: 'Annoncez vos soldes (avec vos vrais pourcentages).', relevantFor: SALES, note: salesNote },
    { name: 'Chandeleur', date: d(year, 2, 2), category: 'fete', emoji: '🥞', description: "C'est le jour des crêpes.", notifyDaysBefore: 5, strategy: 'Une photo de crêpes ou de vos produits pour les crêpes.', relevantFor: ['boulangerie', 'patisserie', 'epicerie', 'restaurant', 'fromagerie', 'bar'] },
    { name: 'Saint-Valentin', date: d(year, 2, 14), category: 'fete', emoji: '❤️', description: 'La fête des amoureux.', notifyDaysBefore: 10, strategy: 'Vos plus belles idées cadeaux.', relevantFor: [...GIFTS, 'restaurant', 'barbier'] },
    { name: 'Mardi Gras', date: addDays(easter, -47), category: 'fete', emoji: '🎭', description: 'Beignets et déguisements.', notifyDaysBefore: 5, strategy: 'Vos beignets ou une touche festive.', relevantFor: ['boulangerie', 'patisserie', 'restaurant', 'jouets'] },
    { name: 'Fête des grands-mères', date: nthWeekday(year, 3, 0, 1), category: 'fete', emoji: '👵', description: 'Le premier dimanche de mars : un cadeau pour mamie.', notifyDaysBefore: 7, strategy: 'Une idée cadeau douce et simple.', relevantFor: ['fleuriste', 'chocolatier', 'patisserie', 'beaute', 'bijouterie', 'cadeaux', 'onglerie', 'jardinerie'] },
    { name: 'Journée des droits des femmes', date: d(year, 3, 8), category: 'fete', emoji: '💜', description: 'Le 8 mars.', notifyDaysBefore: 5, strategy: 'Mettez en avant les femmes de votre équipe ou de vos producteurs.', relevantFor: ['fleuriste', 'beaute', 'onglerie', 'librairie'] },
    { name: 'Saint-Patrick', date: d(year, 3, 17), category: 'fete', emoji: '☘️', description: 'La fête irlandaise du 17 mars.', notifyDaysBefore: 5, strategy: 'Une ambiance verte et festive.', relevantFor: ['bar', 'restaurant'] },
    { name: 'Arrivée du printemps', date: d(year, 3, 20), category: 'saison', emoji: '🌷', description: 'Le printemps commence autour du 20 mars.', notifyDaysBefore: 5, strategy: 'Vos nouveautés de printemps.', relevantFor: ['fleuriste', 'jardinerie', 'vetements', 'chaussures', 'primeur', 'toilettage', 'opticien', 'pressing', 'cadeaux'] },
    { name: "Poisson d'avril", date: d(year, 4, 1), category: 'fete', emoji: '🐠', description: 'Le 1er avril.', notifyDaysBefore: 5, strategy: 'Vos poissons en chocolat ou un clin d\'œil amusant.', relevantFor: ['chocolatier', 'patisserie', 'boulangerie', 'poissonnerie'] },
    { name: 'Pâques', date: easter, category: 'religieux', emoji: '🐣', description: 'Chocolats et repas de famille.', notifyDaysBefore: 10, strategy: 'Vos créations de Pâques.', relevantFor: [...FOOD, ...FRESH, 'fleuriste', 'jouets'] },
    { name: 'Journée mondiale du livre', date: d(year, 4, 23), category: 'fete', emoji: '📖', description: 'Le 23 avril.', notifyDaysBefore: 5, strategy: 'Un coup de cœur de lecture.', relevantFor: ['librairie'] },
    { name: 'Fête du Travail', date: d(year, 5, 1), category: 'fete', emoji: '🌿', description: 'Le muguet porte-bonheur.', notifyDaysBefore: 5, strategy: 'Vos brins de muguet (ou un mot sur vos horaires si vous les avez précisés).', relevantFor: ['fleuriste', 'jardinerie'] },
    { name: 'Saint-Honoré', date: d(year, 5, 16), category: 'fete', emoji: '🥐', description: 'Le 16 mai, la fête des boulangers et pâtissiers.', notifyDaysBefore: 5, strategy: 'Montrez votre fournil et votre équipe.', relevantFor: ['boulangerie', 'patisserie'] },
    { name: 'Fête des mères', date: mothersDay(year), category: 'fete', emoji: '🌸', description: 'Gâtez toutes les mamans.', notifyDaysBefore: 12, strategy: 'Vos plus belles créations pour les mamans.', relevantFor: [...GIFTS, 'restaurant', 'jardinerie', 'traiteur'] },
    { name: 'Fête des pères', date: nthWeekday(year, 6, 0, 3), category: 'fete', emoji: '👔', description: 'Un cadeau pour papa.', notifyDaysBefore: 10, strategy: 'Une idée cadeau pour les papas.', relevantFor: ['caviste', 'chocolatier', 'vetements', 'chaussures', 'coiffure', 'barbier', 'artisan', 'restaurant', 'epicerie', 'boucherie', 'fromagerie', 'bijouterie', 'cadeaux', 'librairie'] },
    { name: 'Fête de la musique', date: d(year, 6, 21), category: 'saison', emoji: '🎶', description: "Le premier soir de l'été.", notifyDaysBefore: 5, strategy: "Une ambiance d'été dans votre boutique.", relevantFor: ['restaurant', 'caviste', 'epicerie', 'bar'] },
    { name: "Soldes d'été", date: summer.start, endDate: summer.end, category: 'soldes', emoji: '☀️', description: '4 semaines de soldes.', notifyDaysBefore: 5, strategy: 'Annoncez vos soldes (avec vos vrais pourcentages).', relevantFor: SALES, note: salesNote },
    { name: 'Saint-Fiacre', date: d(year, 8, 30), category: 'fete', emoji: '🌻', description: 'Le 30 août, la fête des jardiniers.', notifyDaysBefore: 5, strategy: 'Vos plantes et vos conseils de fin d\'été.', relevantFor: ['jardinerie', 'fleuriste'] },
    { name: 'Rentrée', date: d(year, 9, 1), category: 'saison', emoji: '🎒', description: 'Nouvelle saison, nouvelles envies.', notifyDaysBefore: 7, strategy: 'Un nouveau look, une nouvelle collection.', relevantFor: [...BOOKINGS, 'vetements', 'chaussures', 'librairie', 'opticien', 'jouets', 'cordonnerie', 'pressing', 'tatoueur', 'autre'] },
    { name: 'Retour des huîtres', date: d(year, 9, 1), category: 'saison', emoji: '🦪', description: 'Les mois en « r » sont de retour.', notifyDaysBefore: 5, strategy: 'Votre premier arrivage de la saison.', relevantFor: ['poissonnerie', 'restaurant', 'caviste', 'traiteur'] },
    { name: 'Fête des grands-pères', date: nthWeekday(year, 10, 0, 1), category: 'fete', emoji: '👴', description: "Le premier dimanche d'octobre : un cadeau pour papi.", notifyDaysBefore: 7, strategy: 'Une idée cadeau pour les grands-pères.', relevantFor: ['caviste', 'chocolatier', 'librairie', 'cadeaux', 'fromagerie', 'epicerie', 'barbier'] },
    { name: 'Halloween', date: d(year, 10, 31), category: 'fete', emoji: '🎃', description: 'Citrouilles et bonbons.', notifyDaysBefore: 7, strategy: 'Une vitrine ou une création aux couleurs d\'Halloween.', relevantFor: ['patisserie', 'chocolatier', 'boulangerie', 'epicerie', 'primeur', 'jouets', 'onglerie', 'tatoueur', 'bar'] },
    { name: 'Toussaint', date: d(year, 11, 1), category: 'religieux', emoji: '🌼', description: 'Chrysanthèmes et compositions.', notifyDaysBefore: 10, strategy: 'Vos compositions pour la Toussaint.', relevantFor: ['fleuriste', 'jardinerie'] },
    { name: 'Movember', date: d(year, 11, 1), endDate: d(year, 11, 30), category: 'saison', emoji: '🥸', description: 'Le mois de la moustache.', notifyDaysBefore: 5, strategy: 'Vos plus belles moustaches et barbes.', relevantFor: ['barbier'] },
    { name: 'Beaujolais nouveau', date: nthWeekday(year, 11, 4, 3), category: 'saison', emoji: '🍇', description: 'Le 3e jeudi de novembre.', notifyDaysBefore: 7, strategy: 'Vos bouteilles et une idée d\'accord.', relevantFor: ['caviste', 'restaurant', 'epicerie', 'bar', 'fromagerie'] },
    { name: 'Black Friday', date: blackFriday, category: 'commercial', emoji: '🛍️', description: 'Le grand jour des bonnes affaires.', notifyDaysBefore: 10, strategy: 'Seulement si vous faites une vraie offre : annoncez-la.', relevantFor: RETAIL },
    { name: 'Cyber Monday', date: addDays(blackFriday, 3), category: 'commercial', emoji: '💻', description: 'Le lundi après le Black Friday.', notifyDaysBefore: 5, strategy: 'Rappelez vos offres si vous en avez.', relevantFor: ['vetements', 'artisan'] },
    { name: 'Saint-Nicolas', date: d(year, 12, 6), category: 'fete', emoji: '🎅', description: "Le 6 décembre, fêté surtout dans l'Est et le Nord.", notifyDaysBefore: 7, strategy: 'Vos pains d\'épices, chocolats ou cadeaux pour les enfants.', relevantFor: ['chocolatier', 'boulangerie', 'patisserie', 'jouets'] },
    { name: 'Noël', date: d(year, 12, 25), category: 'fete', emoji: '🎄', description: 'La période la plus importante de l\'année.', notifyDaysBefore: 21, strategy: 'Vos idées cadeaux et vos créations de fêtes.', relevantFor: 'all' },
    { name: 'Réveillon', date: d(year, 12, 31), category: 'fete', emoji: '🎉', description: 'La dernière soirée de l\'année.', notifyDaysBefore: 7, strategy: 'Tout pour une belle soirée.', relevantFor: [...FOOD, ...FRESH, 'fleuriste', 'bar', ...BOOKINGS] },
  ];

  return list.map((e) => ({ ...e, key: slug(e.name), id: `${slug(e.name)}-${year}` }));
}

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** Ce qui définit le calendrier d'un commerce : son métier, et ses occasions choisies s'il est hors liste. */
export type CalendarProfile = BusinessType | { businessType: BusinessType; occasionKeys?: string[] };

export function isRelevant(e: CommercialEvent, profile: CalendarProfile): boolean {
  const type = typeof profile === 'string' ? profile : profile.businessType;
  const keys = typeof profile === 'string' ? undefined : profile.occasionKeys;
  if (e.relevantFor === 'all') return true;
  if (keys?.length) return keys.includes(e.key);
  return e.relevantFor.includes(type) || type === 'autre';
}

/** Toutes les occasions possibles (une par clé), pour que l'IA choisisse celles d'un métier hors liste. */
export function occasionCatalog(year = new Date().getFullYear()): { key: string; name: string; description: string }[] {
  return eventsForYear(year).map((e) => ({ key: e.key, name: e.name, description: e.description }));
}

/** Occasions à venir (aujourd'hui inclus), filtrées par métier, sur les `months` prochains mois. */
export function upcomingEvents(profile: CalendarProfile, from: Date = new Date(), months = 12, postalCode?: string): CommercialEvent[] {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const limit = new Date(today.getFullYear(), today.getMonth() + months, today.getDate());
  return [...eventsForYear(today.getFullYear(), postalCode), ...eventsForYear(today.getFullYear() + 1, postalCode)]
    .filter((e) => isRelevant(e, profile))
    .filter((e) => (e.endDate ?? e.date) >= today && e.date <= limit)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

export function daysUntil(date: Date, from: Date = new Date()): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((b - a) / 86_400_000);
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const shortMonth = (date: Date) => MONTHS[date.getMonth()].replace('.', '').toUpperCase();
export const longDate = (date: Date) => `${date.getDate()} ${MONTHS_LONG[date.getMonth()]}`;

export function inDaysLabel(n: number): string {
  if (n <= 0) return "Aujourd'hui";
  if (n === 1) return 'Demain';
  return `Dans ${n} jours`;
}
