/**
 * Statistiques des posts (likes, commentaires, vues, personnes touchées), lues chez Instagram et Facebook.
 * Fichier « pur » (aucune dépendance React Native) : testé avec node --test.
 * Règle d'or : un chiffre que Meta ne donne pas reste null, il n'est jamais estimé.
 */
import type { Platform, Post } from './types';

export interface Stats {
  likes: number | null;
  comments: number | null;
  views: number | null;
  reach: number | null;
}

/** Chiffres d'un post, réseau par réseau. */
export type PostStats = Partial<Record<Platform, Stats>>;
/** Tous les posts : identifiant du post -> ses chiffres. */
export type StatsMap = Record<string, PostStats>;

const add = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : a + b);

/** Instagram + Facebook réunis. null si aucun réseau n'a donné ce chiffre. */
export function totalOf(s: PostStats | undefined): Stats {
  const out: Stats = { likes: null, comments: null, views: null, reach: null };
  for (const p of Object.values(s ?? {})) {
    if (!p) continue;
    out.likes = add(out.likes, p.likes);
    out.comments = add(out.comments, p.comments);
    out.views = add(out.views, p.views);
    out.reach = add(out.reach, p.reach);
  }
  return out;
}

/** Au moins un chiffre connu pour ce post ? */
export const hasStats = (s: Stats) => s.likes !== null || s.comments !== null || s.views !== null || s.reach !== null;

/** Personnes touchées sur une liste de posts (somme). null si aucun chiffre connu. */
export function reachOf(posts: Post[], stats: StatsMap): number | null {
  return posts.reduce<number | null>((sum, p) => add(sum, totalOf(stats[p.id]).reach), null);
}

/** Vues sur une liste de posts (somme). null si aucun chiffre connu. */
export function viewsOf(posts: Post[], stats: StatsMap): number | null {
  return posts.reduce<number | null>((sum, p) => add(sum, totalOf(stats[p.id]).views), null);
}

/**
 * Le post préféré des clients : le plus de likes + commentaires, puis le plus de vues.
 * null si aucun post n'a de chiffre, ou si tous sont à zéro (rien à mettre en avant).
 */
export function bestPost(posts: Post[], stats: StatsMap): { post: Post; stats: Stats } | null {
  let best: { post: Post; stats: Stats; score: number; views: number } | null = null;
  for (const post of posts) {
    const s = totalOf(stats[post.id]);
    if (!hasStats(s)) continue;
    const score = (s.likes ?? 0) + (s.comments ?? 0);
    const views = s.views ?? s.reach ?? 0;
    if (score === 0 && views === 0) continue;
    if (!best || score > best.score || (score === best.score && views > best.views)) best = { post, stats: s, score, views };
  }
  return best ? { post: best.post, stats: best.stats } : null;
}

/** « 1 234 » (espace fine des milliers, à la française). */
export const formatCount = (n: number) => n.toLocaleString('fr-FR');

/** « 3 j'aime · 1 commentaire · 42 vues » — seulement les chiffres connus. */
export function statsLine(s: Stats): string {
  const parts: string[] = [];
  if (s.likes !== null) parts.push(`${formatCount(s.likes)} j'aime`);
  if (s.comments !== null) parts.push(`${formatCount(s.comments)} ${s.comments > 1 ? 'commentaires' : 'commentaire'}`);
  if (s.views !== null) parts.push(`${formatCount(s.views)} ${s.views > 1 ? 'vues' : 'vue'}`);
  return parts.join(' · ');
}
