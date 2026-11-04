/**
 * Planning de la semaine : ce que Vitrine conseille de publier chaque jour (post, story ou repos),
 * avec une idée précise, et les posts que le commerçant a préparés à l'avance.
 * Fichier « pur » (aucune dépendance React Native) : testé avec node --test.
 */
import type { CommercialEvent } from './events';
import type { Business, Post, PostIdea, PublicationResult, PostStatus } from './types';

export type DayKind = 'post' | 'story' | 'rest';

/** Ce que le commerçant a changé sur un jour : son propre choix, ou « une autre idée ». */
export interface DayChoice {
  kind?: DayKind;
  /** Nombre d'appuis sur « Une autre idée ». */
  shift?: number;
}
/** Choix du commerçant, rangés par jour (« 2026-11-06 »). */
export type PlanChoices = Record<string, DayChoice>;

export interface PlanDay {
  /** « 2026-11-06 » */
  key: string;
  date: Date;
  /** Le conseil de Vitrine pour ce jour. */
  advice: DayKind;
  /** Ce qui est retenu : le choix du commerçant, sinon le conseil. */
  kind: DayKind;
  /** Boutique fermée ce jour-là (réglage « Jours de fermeture »). */
  closed: boolean;
  idea: PostIdea | null;
  /** Fête à préparer ce jour-là (le post le plus proche avant la fête). */
  occasion: CommercialEvent | null;
}

/** Noms des jours, du lundi (0) au dimanche (6). */
export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Rythme conseillé : 3 posts et 2 stories par semaine. */
export const WEEK_GOAL = { post: 3, story: 2 } as const;
// Jours préférés, du meilleur au moins bon (0 = lundi) : le samedi pour les posts, le vendredi pour les stories.
const POST_DAYS = [5, 1, 3, 4, 2, 6, 0];
const STORY_DAYS = [4, 2, 6, 0, 1, 3, 5];

const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
/** Jour de la semaine avec lundi = 0. */
export const weekday = (d: Date) => (d.getDay() + 6) % 7;

/** Lundi de la semaine de `d`, décalé de `offset` semaines. */
export function weekStart(d: Date, offset = 0): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekday(d) + offset * 7);
}

/** « Du 2 au 8 novembre », « Du 30 novembre au 6 décembre ». */
export function weekLabel(start: Date): string {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const from = start.getMonth() === end.getMonth() ? `${start.getDate()}` : `${start.getDate()} ${MONTHS[start.getMonth()]}`;
  return `Du ${from} au ${end.getDate()} ${MONTHS[end.getMonth()]}`;
}

/** « Vendredi 6 novembre » */
export function dayLabel(d: Date): string {
  return `${DAY_NAMES[weekday(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Conseil de base de la semaine : 3 posts, 2 stories, les autres jours au repos. Les jours de fermeture restent au repos. */
export function weekRhythm(closedDays: number[] = []): DayKind[] {
  const out: DayKind[] = Array(7).fill('rest');
  const open = (i: number) => !closedDays.includes(i) && out[i] === 'rest';
  for (const i of POST_DAYS.filter((i) => !closedDays.includes(i)).slice(0, WEEK_GOAL.post)) out[i] = 'post';
  for (const i of STORY_DAYS.filter(open).slice(0, WEEK_GOAL.story)) out[i] = 'story';
  return out;
}

/** Idées de posts : simples, sans prix ni promotion inventés. */
function postIdeas(products: string[]): PostIdea[] {
  const p = (i: number) => products[i % Math.max(products.length, 1)]?.toLowerCase();
  return [
    { title: p(0) ? `À l'honneur : ${p(0)}` : 'Votre produit du moment', photo: p(0) ? `${products[0]}, de près, à la lumière du jour.` : 'Le produit que vous aimez le plus en ce moment, de près, à la lumière du jour.', why: 'Un beau produit en gros plan donne envie de passer vous voir.' },
    { title: 'Votre vitrine aujourd\'hui', photo: 'La devanture ou la vitrine, prise depuis le trottoir.', why: 'Les gens du quartier reconnaîtront la boutique en passant devant.' },
    { title: 'Votre savoir-faire', photo: 'Vos mains au travail : une préparation, un geste précis.', why: 'Les clients adorent voir le travail derrière ce qu\'ils achètent.' },
    { title: p(1) ? `Zoom sur ${p(1)}` : 'Un détail qui fait la différence', photo: p(1) ? `${products[1 % products.length]}, joliment présenté sur le comptoir.` : 'Un détail de la boutique que vos clients ne remarquent pas toujours.', why: 'Montrer la variété de la boutique donne des idées à vos clients.' },
    { title: 'La saison dans la boutique', photo: 'Ce qui change en ce moment chez vous avec la saison.', why: 'Vos clients voient que la boutique vit au rythme de l\'année.' },
    { title: 'L\'équipe', photo: 'Vous ou votre équipe, souriants, derrière le comptoir.', why: 'On fait plus facilement confiance à un visage qu\'on connaît.' },
  ];
}

/** Idées de stories : sur le vif, quelques secondes, se font le jour même. */
const STORY_IDEAS: PostIdea[] = [
  { title: 'Les coulisses du matin', photo: 'Filmez 5 secondes de la préparation avant l\'ouverture.', why: 'Les stories montrent la vie de la boutique, au jour le jour.' },
  { title: 'Une commande prête', photo: 'Une commande joliment emballée, juste avant qu\'elle parte.', why: 'Juste avant le week-end, beaucoup de monde regarde les stories.' },
  { title: 'Un nouvel arrivage', photo: 'Les produits qui viennent d\'arriver, en sortant du carton.', why: 'Vos clients aiment être les premiers au courant.' },
  { title: 'La boutique ouvre', photo: 'La porte qui s\'ouvre ou les lumières qui s\'allument.', why: 'Un petit bonjour du matin rappelle que vous êtes là.' },
  { title: 'Un geste de votre métier', photo: 'Filmez vos mains pendant 5 secondes, en plein travail.', why: 'C\'est court, vrai, et ça donne envie de vous rendre visite.' },
];

const splitProducts = (s?: string) => (s ?? '').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
/** Numéro de la semaine depuis 1970 : fait tourner les idées d'une semaine à l'autre. */
const weekIndex = (start: Date) => Math.floor(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) / (7 * 86_400_000));

/**
 * Les 7 jours de la semaine qui commence le lundi `start`, avec le conseil, l'idée et les choix du commerçant.
 * `events` : les fêtes à venir du commerce (upcomingEvents), pour préparer la prochaine.
 */
export function buildWeek(b: Business, start: Date, choices: PlanChoices, events: CommercialEvent[]): PlanDay[] {
  const closedDays = b.closedDays ?? [];
  const rhythm = weekRhythm(closedDays);
  const pIdeas = postIdeas(splitProducts(b.specialties));
  const w = weekIndex(start);
  const days: PlanDay[] = rhythm.map((advice, i) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = dayKey(date);
    const choice = choices[key] ?? {};
    return { key, date, advice, kind: choice.kind ?? advice, closed: closedDays.includes(i), idea: null, occasion: null };
  });

  // Fête dans les 3 semaines : on la prépare avec le dernier post de la semaine qui tombe avant elle.
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7 + 14);
  const fete = events.find((e) => e.date >= start && e.date < end && days.some((d) => d.kind === 'post' && d.date <= e.date));
  if (fete) {
    const target = [...days].reverse().find((d) => d.kind === 'post' && d.date <= fete.date);
    if (target && !(choices[target.key]?.shift)) {
      target.occasion = fete;
      target.idea = { title: `Préparer ${fete.name}`, photo: fete.strategy, why: fete.description };
    }
  }

  let nPost = 0;
  let nStory = 0;
  for (const d of days) {
    if (d.idea || d.kind === 'rest') continue;
    const shift = choices[d.key]?.shift ?? 0;
    if (d.kind === 'post') d.idea = pIdeas[(w * WEEK_GOAL.post + nPost++ + shift) % pIdeas.length];
    else d.idea = STORY_IDEAS[(w * WEEK_GOAL.story + nStory++ + shift) % STORY_IDEAS.length];
  }
  return days;
}

/** Posts et stories rangés sur un jour : prévus pour ce jour, ou publiés ce jour-là. */
export function postsOfDay(posts: Post[], key: string): Post[] {
  return posts.filter((p) =>
    (p.status === 'scheduled' && p.scheduledFor && dayKey(new Date(p.scheduledFor)) === key) ||
    ((p.status === 'published' || p.status === 'partially_published') && p.publishedAt && dayKey(new Date(p.publishedAt)) === key));
}

/** Combien de posts et de stories sont prêts ou publiés cette semaine. */
export function weekCount(posts: Post[], days: PlanDay[]): { post: number; story: number } {
  const list = days.flatMap((d) => postsOfDay(posts, d.key));
  return { post: list.filter((p) => p.kind !== 'story').length, story: list.filter((p) => p.kind === 'story').length };
}

/** Statut d'un post après une tentative de publication (Instagram et/ou Facebook). */
export function statusAfterPublish(publications: PublicationResult[]): PostStatus {
  const ok = publications.filter((x) => x.status === 'published').length;
  if (ok === publications.length) return 'published';
  if (ok > 0) return 'partially_published';
  return publications.every((x) => x.status === 'not_configured') ? 'draft' : 'failed';
}

/** Date et heure du rappel pour un jour du planning (à l'heure choisie dans les réglages). */
export function reminderDate(key: string, hour: number): Date {
  const d = parseDayKey(key);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0);
}

export interface PlanReminder {
  date: Date;
  title: string;
  body: string;
  day: string;
}

/**
 * Rappels du planning pour les `days` prochains jours, un par jour au plus :
 * « Votre post est prêt » quand un post a été préparé, sinon l'idée du jour (post ou story).
 */
export function planReminders(b: Business, posts: Post[], choices: PlanChoices, events: CommercialEvent[], hour: number, now: Date = new Date(), days = 14): PlanReminder[] {
  const out: PlanReminder[] = [];
  const first = weekStart(now);
  const weeks = [0, 1, 2].flatMap((w) => buildWeek(b, weekStart(first, w), choices, events));
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  for (const d of weeks) {
    const date = reminderDate(d.key, hour);
    if (date <= now || date >= limit) continue;
    const mine = postsOfDay(posts, d.key);
    const ready = mine.find((p) => p.status === 'scheduled');
    if (ready) {
      out.push({ date, day: d.key, title: 'Votre post du jour est prêt', body: 'Il ne reste qu\'à appuyer sur « Publier ». Ouvrez Vitrine.' });
    } else if (d.kind !== 'rest' && d.idea && !mine.length) {
      out.push({ date, day: d.key, title: d.kind === 'story' ? 'Idée de story du jour' : 'Idée de post du jour', body: `${d.idea.title} : ${d.idea.photo}` });
    }
  }
  return out;
}
