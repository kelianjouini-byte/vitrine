// RGPD : POST {action:'export'} -> toutes les données du commerce ; POST {action:'delete'} -> suppression totale.
import { handler, json, HttpError } from '../_shared/http.ts';
import { requireMerchant } from '../_shared/db.ts';

Deno.serve(handler(async (req) => {
  const { db, userId, business } = await requireMerchant(req);
  const { action } = await req.json().catch(() => ({}));

  if (action === 'export') {
    const [posts, pubs, gens] = await Promise.all([
      db.from('posts').select('*').eq('business_id', business.id),
      db.from('post_publications').select('*, posts!inner(business_id)').eq('posts.business_id', business.id),
      db.from('ai_generations').select('created_at, prompt_version, output_data').eq('business_id', business.id),
    ]);
    return json({ business, posts: posts.data, publications: pubs.data, ai_generations: gens.data });
  }

  if (action === 'delete') {
    // 1. photos du stockage
    const { data: files } = await db.storage.from('post-images').list(userId, { limit: 1000 });
    if (files?.length) await db.storage.from('post-images').remove(files.map((f) => `${userId}/${f.name}`));
    // 2. compte : la suppression cascade sur users -> businesses -> posts, jetons, etc.
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw new HttpError(500, 'delete_failed', 'La suppression a échoué. Réessayez.');
    return json({ ok: true });
  }
  throw new HttpError(400, 'bad_action', 'Action inconnue.');
}));
