/**
 * « Mon bilan » : les vrais chiffres du mois, calculés à partir des posts du commerçant.
 * Fichier « pur » (aucune dépendance React Native) : testé avec node --test.
 *
 * Règle d'or : on n'affiche QUE des chiffres réels. Ce qu'on ne sait pas encore
 * (vues, abonnés, meilleur post) est affiché « bientôt », jamais estimé.
 */
import type { Post } from './types';

/** Un mois : année + mois (0 = janvier, comme les dates JavaScript). */
export interface Month {
  year: number;
  month: number;
}

/** Estimation du temps qu'un commerçant passe sur un post sans Vitrine (photo à part). */
export const MINUTES_SAVED_PER_POST = 20;

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const monthOf = (d: Date): Month => ({ year: d.getFullYear(), month: d.getMonth() });
export const addMonths = (m: Month, n: number): Month => monthOf(new Date(m.year, m.month + n, 1));
export const sameMonth = (a: Month, b: Month) => a.year === b.year && a.month === b.month;
/** Ordre chronologique : négatif si a est avant b. */
export const compareMonths = (a: Month, b: Month) => (a.year - b.year) * 12 + (a.month - b.month);

/** « novembre » */
export const monthName = (m: Month) => MONTHS[m.month];
/** « novembre 2026 » */
export const monthLabel = (m: Month) => `${MONTHS[m.month]} ${m.year}`;
/** « de novembre » / « d'octobre » (élision devant une voyelle). */
export const ofMonth = (m: Month) => (/^[aeiouy]/.test(MONTHS[m.month]) ? `d'${MONTHS[m.month]}` : `de ${MONTHS[m.month]}`);
/** Clé « 2026-11 » (stockage, serveur). */
export const monthKey = (m: Month) => `${m.year}-${String(m.month + 1).padStart(2, '0')}`;

/** Un post compte s'il est vraiment parti sur au moins un réseau. */
export function isPublished(p: Post): boolean {
  return p.status === 'published' || p.status === 'partially_published';
}

/** Les posts publiés pendant ce mois, du plus récent au plus ancien. */
export function postsOfMonth(posts: Post[], m: Month): Post[] {
  return posts
    .filter(isPublished)
    .filter((p) => sameMonth(monthOf(new Date(p.publishedAt ?? p.createdAt)), m))
    .sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt));
}

/** « 1 h 20 », « 40 min », « 0 min ». */
export function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${h} h ${String(rest).padStart(2, '0')}` : `${h} h`;
}

export type Trend = 'up' | 'down' | 'same' | 'first';

export interface MonthSummary {
  month: Month;
  previous: Month;
  /** Posts publiés ce mois-ci (vrai chiffre). */
  count: number;
  /** Posts publiés le mois d'avant (vrai chiffre). */
  previousCount: number;
  /** Temps gagné, en minutes (estimation : 20 min par post). */
  minutesSaved: number;
  /** Le mois est-il en cours ? Alors la comparaison n'est pas définitive. */
  inProgress: boolean;
  /** Jours qu'il reste dans le mois en cours (0 si le mois est fini). */
  daysLeft: number;
  trend: Trend;
  posts: Post[];
}

export function summarize(posts: Post[], m: Month, today: Date = new Date()): MonthSummary {
  const previous = addMonths(m, -1);
  const list = postsOfMonth(posts, m);
  const count = list.length;
  const previousCount = postsOfMonth(posts, previous).length;
  const inProgress = sameMonth(m, monthOf(today));
  const lastDay = new Date(m.year, m.month + 1, 0).getDate();
  const daysLeft = inProgress ? lastDay - today.getDate() : 0;
  // « first » : rien le mois d'avant, on ne peut pas comparer.
  const trend: Trend = previousCount === 0 && count === 0 ? 'same' : previousCount === 0 ? 'first' : count > previousCount ? 'up' : count < previousCount ? 'down' : 'same';
  return { month: m, previous, count, previousCount, minutesSaved: count * MINUTES_SAVED_PER_POST, inProgress, daysLeft, trend, posts: list };
}

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** La phrase de comparaison avec le mois d'avant, avec les vrais chiffres. */
export function comparisonText(s: MonthSummary): string {
  const prev = `En ${monthName(s.previous)} : ${plural(s.previousCount, 'post', 'posts')}.`;
  const now = s.inProgress ? 'Ce mois-ci' : `En ${monthName(s.month)}`;
  const diff = Math.abs(s.count - s.previousCount);
  if (s.count === 0 && s.previousCount === 0) return `Aucun post publié en ${monthName(s.month)} ni en ${monthName(s.previous)}.`;
  if (s.trend === 'first') return `${prev} ${now}, vous avez repris : bravo !`;
  if (s.trend === 'same') return `${prev} ${now} aussi : vous êtes régulier.`;
  if (s.trend === 'up') return `${prev} ${now}, c'est ${plural(diff, 'post', 'posts')} de plus. Bravo ! 👏`;
  // Baisse : on reste encourageant, et on rappelle qu'il reste du temps si le mois n'est pas fini.
  return s.inProgress
    ? `${prev} Pour l'instant, ${plural(diff, 'post', 'posts')} de moins, mais il reste ${plural(s.daysLeft, 'jour', 'jours')} pour rattraper.`
    : `${prev} ${now}, ${plural(diff, 'post', 'posts')} de moins.`;
}

/**
 * Conseil simple, utilisé seulement quand l'IA n'est pas branchée (l'écran le dit).
 * Il n'invente aucun chiffre : il ne reprend que les vrais.
 */
export function basicAdvice(s: MonthSummary, nextOccasion?: { name: string } | null): string {
  if (s.count === 0) {
    return nextOccasion
      ? `Commencez par un post simple : une photo de votre plus beau produit. Et pensez à l'occasion qui arrive : ${nextOccasion.name}.`
      : 'Commencez par un post simple : une photo de votre plus beau produit, prise à la lumière du jour.';
  }
  if (s.trend === 'down') {
    return 'Essayez de publier un jour fixe chaque semaine, par exemple le lundi matin : vos clients prennent l\'habitude de vous voir.';
  }
  return nextOccasion
    ? `Continuez comme ça ! Préparez dès maintenant un post pour cette occasion : ${nextOccasion.name}.`
    : 'Continuez comme ça ! Variez les photos : un produit, les coulisses, puis votre vitrine.';
}

/** Les mois qu'on peut consulter : du premier post publié jusqu'au mois en cours. */
export function firstMonth(posts: Post[], today: Date = new Date()): Month {
  const dates = posts.filter(isPublished).map((p) => p.publishedAt ?? p.createdAt).sort();
  const current = monthOf(today);
  if (!dates.length) return addMonths(current, -1);
  const first = monthOf(new Date(dates[0]));
  // Au moins le mois d'avant, pour pouvoir comparer.
  return compareMonths(first, addMonths(current, -1)) < 0 ? first : addMonths(current, -1);
}

/** Dates des notifications « Votre bilan de [mois] est prêt » : le 1er de chaque mois, à l'heure choisie. */
export function reportReminderDates(from: Date, hour: number, count = 12): { date: Date; month: Month }[] {
  const out: { date: Date; month: Month }[] = [];
  for (let i = 1; out.length < count; i++) {
    const date = new Date(from.getFullYear(), from.getMonth() + i, 1, hour, 0);
    if (date > from) out.push({ date, month: addMonths(monthOf(date), -1) });
  }
  return out;
}

export function reportReminderText(m: Month): { title: string; body: string } {
  return {
    title: `📈 Votre bilan ${ofMonth(m)} est prêt`,
    body: 'Vos posts du mois, le temps gagné et un conseil pour le mois qui commence.',
  };
}
