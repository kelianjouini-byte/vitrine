// POST {} -> { stats: { [postId]: { instagram?: Stats, facebook?: Stats } } }
// Statistiques des publications de la boutique (90 derniers jours), lues chez Meta.
// Gardées 30 minutes dans post_stats pour ne pas interroger Meta à chaque ouverture de l'appli.
// Jamais de chiffre inventé : ce que Meta ne donne pas reste null.
import { handler, json } from '../_shared/http.ts';
import { requireMerchant } from '../_shared/db.ts';
import { decrypt } from '../_shared/crypto.ts';
import { facebookStats, instagramStats, type Stats } from '../_shared/stats.ts';

const FRESH_MINUTES = 30;
const MAX_REFRESH = 40;

type Platform = 'instagram' | 'facebook';
interface Pub { id: string; post_id: string; platform: Platform; platform_post_id: string; posts: { kind: string | null } }
interface Row extends Stats { publication_id: string; post_id: string; platform: Platform; fetched_at: string }

Deno.serve(handler(async (req) => {
  const { db, business } = await requireMerchant(req);
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

  const { data: pubs } = await db.from('post_publications')
    .select('id, post_id, platform, platform_post_id, posts!inner(business_id, kind)')
    .eq('posts.business_id', business.id).eq('status', 'published').not('platform_post_id', 'is', null)
    .gte('published_at', since).order('published_at', { ascending: false }).limit(200);
  const list = (pubs ?? []) as unknown as Pub[];
  if (!list.length) return json({ stats: {} });

  const { data: cached } = await db.from('post_stats').select('*').in('publication_id', list.map((p) => p.id));
  const byPub = new Map(((cached ?? []) as Row[]).map((r) => [r.publication_id, r]));
  const stale = Date.now() - FRESH_MINUTES * 60_000;
  const toRefresh = list.filter((p) => !byPub.has(p.id) || new Date(byPub.get(p.id)!.fetched_at).getTime() < stale).slice(0, MAX_REFRESH);

  if (toRefresh.length) {
    // Le jeton de Page (chiffré) sert pour Instagram et Facebook.
    const { data: accounts } = await db.from('social_accounts').select('platform, encrypted_access_token, connection_status').eq('business_id', business.id);
    const tokens = new Map<Platform, string>();
    for (const a of accounts ?? []) {
      if (a.connection_status === 'connected') tokens.set(a.platform as Platform, await decrypt(a.encrypted_access_token));
    }
    const fresh: Row[] = [];
    // Par petits groupes, pour rester poli avec Meta.
    for (let i = 0; i < toRefresh.length; i += 5) {
      const group = toRefresh.slice(i, i + 5);
      const results = await Promise.all(group.map(async (p) => {
        const token = tokens.get(p.platform);
        if (!token) return null;
        const s = p.platform === 'instagram'
          ? await instagramStats(p.platform_post_id, token, p.posts?.kind === 'story')
          : await facebookStats(p.platform_post_id, token);
        return { publication_id: p.id, post_id: p.post_id, platform: p.platform, fetched_at: new Date().toISOString(), ...s } as Row;
      }));
      fresh.push(...results.filter((r): r is Row => r !== null));
    }
    if (fresh.length) {
      await db.from('post_stats').upsert(fresh.map((r) => ({ ...r, business_id: business.id })), { onConflict: 'publication_id' });
      for (const r of fresh) byPub.set(r.publication_id, r);
    }
  }

  const stats: Record<string, Partial<Record<Platform, Stats>>> = {};
  for (const p of list) {
    const r = byPub.get(p.id);
    if (!r) continue;
    (stats[p.post_id] ??= {})[p.platform] = { likes: r.likes, comments: r.comments, views: r.views, reach: r.reach };
  }
  return json({ stats });
}));
