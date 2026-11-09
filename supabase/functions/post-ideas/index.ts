// POST { occasions?: [{ name, date }], trade_hint? } -> { ideas: [{ title, photo, why }] }
// L'assistant « Je ne sais pas quoi poster » : 3 idées adaptées à la boutique.
import { requireAccess } from '../_shared/access.ts';
import { handler, json } from '../_shared/http.ts';
import { rateLimit, requireMerchant } from '../_shared/db.ts';
import { suggestIdeas } from '../_shared/openai.ts';
import { IDEAS_PROMPT_VERSION } from '../_shared/ideas.ts';

Deno.serve(handler(async (req) => {
  const { db, business, company } = await requireMerchant(req);
  await requireAccess(db, company);
  const body = await req.json().catch(() => ({}));

  // Limitation des coûts : 12 demandes d'idées par heure et par boutique.
  await rateLimit(db, 'post_ideas', business.id, 12, 60);

  // Occasions du calendrier Vitrine, calculées par l'app (même calendrier que l'écran « Fêtes »).
  const occasions = (Array.isArray(body.occasions) ? body.occasions : []).slice(0, 5).map((o: Record<string, unknown>) => ({
    name: String(o.name ?? '').slice(0, 60),
    date: String(o.date ?? '').slice(0, 10),
  })).filter((o: { name: string; date: string }) => o.name && /^\d{4}-\d{2}-\d{2}$/.test(o.date));

  const [{ data: recent }, { data: votes }] = await Promise.all([
    db.from('posts').select('instagram_caption').eq('business_id', business.id).not('instagram_caption', 'is', null).order('created_at', { ascending: false }).limit(8),
    db.from('post_idea_feedback').select('idea_title, vote').eq('business_id', business.id).order('created_at', { ascending: false }).limit(40),
  ]);
  // Le dernier avis donné sur une idée compte (le commerçant peut changer d'avis).
  const lastVote = new Map<string, number>();
  for (const v of votes ?? []) if (!lastVote.has(v.idea_title)) lastVote.set(v.idea_title, v.vote);

  const ideas = await suggestIdeas({
    businessName: business.business_name,
    trade: business.trade || business.business_type,
    city: business.city,
    tone: business.tone,
    products: business.specialties,
    strengths: business.strengths,
    audience: business.audience,
    description: business.description,
    tradeHint: String(body.trade_hint ?? '').slice(0, 300) || null,
    occasions,
    recentPosts: (recent ?? []).map((r) => String(r.instagram_caption)),
    liked: [...lastVote].filter(([, v]) => v > 0).map(([t]) => t),
    disliked: [...lastVote].filter(([, v]) => v < 0).map(([t]) => t),
    today: new Date().toISOString().slice(0, 10),
  });

  await db.from('post_ideas').insert({ business_id: business.id, ideas: { version: IDEAS_PROMPT_VERSION, list: ideas } });
  return json({ ideas });
}));
