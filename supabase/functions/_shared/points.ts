/**
 * Points de l'équipe : règles sans dépendance (testées avec node --test), partagées par l'appli et le serveur.
 * Décisions de Kelian (23 nov. 2026) :
 *  - un employé gagne des points quand il prépare des posts (merci, pas classement) ;
 *  - un seul objectif, pour TOUTE l'équipe (pas de compétition), SANS date ;
 *  - l'employé voit ses points et la barre de l'équipe, jamais les points des collègues ; le patron voit le détail.
 */

/** Points par action. Un post refusé ne rapporte rien (mais ne retire rien). */
export const POINTS = { sent: 10, published: 50 } as const;
export type PointReason = keyof typeof POINTS;

/** Au plus 3 envois comptés par jour et par personne (pour éviter d'envoyer n'importe quoi). */
export const MAX_SENT_PER_DAY = 3;

/** Objectifs proposés au patron (atteignables : quelques semaines d'envois). */
export const GOAL_CHOICES = [500, 1000, 2000] as const;
export const GOAL_MIN = 100;
export const GOAL_MAX = 20000;

/** Points d'un post envoyé puis publié : sert à dire « encore environ 4 posts publiés ». */
export const POINTS_PER_PUBLISHED_POST = POINTS.sent + POINTS.published;

/** Niveaux (points gagnés depuis le début). Noms neutres : une employée ou un employé. */
export const LEVELS = [
  { at: 0, name: 'Premiers pas' },
  { at: 300, name: 'Bon œil' },
  { at: 1000, name: 'Pro de la vitrine' },
  { at: 2500, name: 'Star du quartier' },
  { at: 5000, name: 'Légende de la vitrine' },
] as const;

export interface LevelInfo {
  /** 1 à 5. */
  number: number;
  name: string;
  /** Points pour le niveau suivant (null au dernier niveau). */
  next: number | null;
  nextName: string | null;
  /** Avancée vers le niveau suivant, de 0 à 1 (1 au dernier niveau). */
  progress: number;
}

export function levelOf(points: number): LevelInfo {
  const p = Math.max(0, Math.floor(points || 0));
  let i = 0;
  while (i + 1 < LEVELS.length && p >= LEVELS[i + 1].at) i++;
  const cur = LEVELS[i];
  const nxt = LEVELS[i + 1];
  return {
    number: i + 1,
    name: cur.name,
    next: nxt ? nxt.at : null,
    nextName: nxt ? nxt.name : null,
    progress: nxt ? (p - cur.at) / (nxt.at - cur.at) : 1,
  };
}

/** Points gagnés pour un envoi, selon le nombre d'envois déjà comptés aujourd'hui. */
export function sentPoints(alreadyCountedToday: number): number {
  return alreadyCountedToday < MAX_SENT_PER_DAY ? POINTS.sent : 0;
}

/** Objectif valide : un nombre de points raisonnable et une récompense écrite. */
export function readGoal(points: unknown, reward: unknown): { points: number; reward: string } | null {
  const n = Math.round(Number(points));
  const r = String(reward ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!Number.isFinite(n) || n < GOAL_MIN || n > GOAL_MAX || !r) return null;
  return { points: n, reward: r };
}

/** « encore environ 4 posts publiés » (au moins 1). */
export function postsLeft(goal: number, progress: number): number {
  return Math.max(1, Math.ceil((goal - progress) / POINTS_PER_PUBLISHED_POST));
}

/** « 1 000 » : nombre à la française (espace insécable entre les milliers). */
export function frNumber(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

/** Début du jour à Paris (les envois « du jour » se comptent à l'heure française). */
export function parisDayStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).reduce<Record<string, string>>((a, x) => ((a[x.type] = x.value), a), {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const offset = asUtc - Math.floor(now.getTime() / 60000) * 60000; // décalage Paris - UTC
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset);
}
