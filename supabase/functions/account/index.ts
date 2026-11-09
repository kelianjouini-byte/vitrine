// RGPD : POST {action:'export'} -> toutes les données du commerce ; POST {action:'delete'} -> suppression totale.
// Créateur du compte : tout est supprimé (boutiques ajoutées, équipe, photos). Membre de l'équipe : seulement son propre accès
// (les posts qu'il a préparés restent dans la boutique, qui appartient au patron).
import { handler, json, HttpError } from '../_shared/http.ts';
import { requireMerchant } from '../_shared/db.ts';
import { isLive } from '../_shared/billing.ts';
import { stripe } from '../_shared/stripe.ts';

Deno.serve(handler(async (req) => {
  const { db, userId, company: business, member } = await requireMerchant(req);
  const { action } = await req.json().catch(() => ({}));

  if (member.role !== 'owner') {
    if (action !== 'delete') throw new HttpError(403, 'patron_only', 'Seul le créateur du compte peut exporter les données.');
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw new HttpError(500, 'delete_failed', 'La suppression a échoué. Réessayez.');
    return json({ ok: true });
  }

  if (action === 'export') {
    const [posts, pubs, gens, sub] = await Promise.all([
      db.from('posts').select('*').eq('business_id', business.id),
      db.from('post_publications').select('*, posts!inner(business_id)').eq('posts.business_id', business.id),
      db.from('ai_generations').select('created_at, prompt_version, output_data').eq('business_id', business.id),
      db.from('subscriptions').select('plan, status, current_period_end, trial_end, commitment_ends_at, created_at').eq('business_id', business.id).maybeSingle(),
    ]);
    return json({ business, posts: posts.data, publications: pubs.data, ai_generations: gens.data, subscription: sub.data });
  }

  if (action === 'delete') {
    // 0. abonnement Stripe arrêté tout de suite : plus aucun prélèvement après la suppression du compte.
    const { data: sub } = await db.from('subscriptions').select('stripe_subscription_id, status').eq('business_id', business.id).maybeSingle();
    if (sub?.stripe_subscription_id && isLive(sub.status)) await stripe('DELETE', `subscriptions/${sub.stripe_subscription_id}`);
    // 1. photos du stockage : celles du patron et de toute son équipe (par paquets : il peut y en avoir beaucoup)
    const { data: team } = await db.from('team_members').select('user_id').eq('company_id', business.id);
    const folders = [userId, ...((team ?? []).map((t) => t.user_id as string))];
    for (const folder of folders) {
      for (let round = 0; round < 50; round++) {
        const { data: files } = await db.storage.from('post-images').list(folder, { limit: 1000 });
        if (!files?.length) break;
        await db.storage.from('post-images').remove(files.map((f) => `${folder}/${f.name}`));
      }
    }
    // 2. comptes de l'équipe, puis le compte du patron : la suppression cascade sur users -> businesses
    //    (boutiques ajoutées comprises) -> posts, jetons, etc.
    for (const t of team ?? []) await db.auth.admin.deleteUser(t.user_id);
    const { error } = await db.auth.admin.deleteUser(userId);
    if (error) throw new HttpError(500, 'delete_failed', 'La suppression a échoué. Réessayez.');
    return json({ ok: true });
  }
  throw new HttpError(400, 'bad_action', 'Action inconnue.');
}));
