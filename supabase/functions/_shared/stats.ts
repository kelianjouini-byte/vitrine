// Lecture des statistiques d'une publication chez Meta (API officielle).
// Chaque chiffre est lu séparément : si Meta refuse l'un d'eux, il reste « null » (jamais inventé).
import { graph } from './meta.ts';
import { metric, type Insights } from './insights.ts';

export interface Stats {
  likes: number | null;
  comments: number | null;
  views: number | null;
  reach: number | null;
}

const quiet = <T>(p: Promise<T>) => p.catch(() => null);

/** Instagram : likes et commentaires (posts), vues et personnes touchées (posts et stories). */
export async function instagramStats(mediaId: string, token: string, story: boolean): Promise<Stats> {
  const [base, ins] = await Promise.all([
    story ? Promise.resolve(null) : quiet(graph<{ like_count?: number; comments_count?: number }>(mediaId, { fields: 'like_count,comments_count', access_token: token })),
    quiet(graph<Insights>(`${mediaId}/insights`, { metric: 'reach,views', access_token: token })),
  ]);
  return {
    likes: base?.like_count ?? null,
    comments: base?.comments_count ?? null,
    views: metric(ins, 'views'),
    reach: metric(ins, 'reach'),
  };
}

/** Facebook (post de Page) : réactions, commentaires, vues et personnes touchées. */
export async function facebookStats(postId: string, token: string): Promise<Stats> {
  const [base, ins, old] = await Promise.all([
    quiet(graph<{ reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } } }>(
      postId, { fields: 'reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)', access_token: token })),
    // Nouveaux noms des métriques de vues (Meta), puis les anciens si ceux-ci ne sont pas reconnus.
    quiet(graph<Insights>(`${postId}/insights`, { metric: 'post_media_view,post_total_media_view_unique', access_token: token })),
    quiet(graph<Insights>(`${postId}/insights`, { metric: 'post_impressions,post_impressions_unique', access_token: token })),
  ]);
  return {
    likes: base?.reactions?.summary?.total_count ?? null,
    comments: base?.comments?.summary?.total_count ?? null,
    views: metric(ins, 'post_media_view') ?? metric(old, 'post_impressions'),
    reach: metric(ins, 'post_total_media_view_unique') ?? metric(old, 'post_impressions_unique'),
  };
}
