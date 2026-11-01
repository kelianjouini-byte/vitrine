// POST { post_id, caption, hashtags[], platforms[], idempotency_key }
// -> { publications: [{ platform, status, url, error, publishedAt }] }
// Idempotent : une publication déjà réussie n'est JAMAIS renvoyée à Meta.
import { handler, json, HttpError } from '../_shared/http.ts';
import { requireMerchant } from '../_shared/db.ts';
import { decrypt } from '../_shared/crypto.ts';
import { metaConfig, publishInstagram, publishFacebook, friendlyMetaError, MetaError } from '../_shared/meta.ts';

type Platform = 'instagram' | 'facebook';

Deno.serve(handler(async (req) => {
  metaConfig(); // lève meta_not_configured si les secrets Meta manquent
  const { db, business } = await requireMerchant(req);
  const body = await req.json().catch(() => ({}));
  const platforms = (Array.isArray(body.platforms) ? body.platforms : []).filter((p: string) => p === 'instagram' || p === 'facebook') as Platform[];
  const caption = String(body.caption ?? '').trim().slice(0, 2000);
  const hashtags = (Array.isArray(body.hashtags) ? body.hashtags : []).map(String).slice(0, 30);
  const key = String(body.idempotency_key ?? '');
  if (!platforms.length || !caption || key.length < 16) throw new HttpError(400, 'bad_request', 'Publication incomplète.');

  const { data: post } = await db.from('posts').select('*').eq('id', body.post_id).eq('business_id', business.id).maybeSingle();
  if (!post) throw new HttpError(404, 'not_found', 'Publication introuvable.');
  if (post.status === 'publishing') throw new HttpError(409, 'in_progress', 'Cette publication est déjà en cours.');

  // Verrou : passage atomique en « publishing » (empêche deux envois simultanés).
  const { data: locked } = await db.from('posts').update({ status: 'publishing', instagram_caption: caption, facebook_caption: caption, hashtags })
    .eq('id', post.id).neq('status', 'publishing').select('id').maybeSingle();
  if (!locked) throw new HttpError(409, 'in_progress', 'Cette publication est déjà en cours.');

  const fullText = `${caption}\n\n${hashtags.join(' ')}`.trim();
  const { data: img } = await db.storage.from('post-images').createSignedUrl(post.image_url, 3600);
  const results = [];

  for (const platform of platforms) {
    // Ligne de publication unique par (post, réseau).
    await db.from('post_publications').upsert({ post_id: post.id, platform, idempotency_key: key }, { onConflict: 'post_id,platform', ignoreDuplicates: true });
    const { data: pub } = await db.from('post_publications').select('*').eq('post_id', post.id).eq('platform', platform).single();
    if (pub.status === 'published') { // déjà fait : on ne republie pas
      results.push({ platform, status: 'published', url: pub.platform_post_url, publishedAt: pub.published_at });
      continue;
    }
    const log = (kind: string, detail: Record<string, unknown> = {}) => db.from('post_events').insert({ post_id: post.id, kind, detail: { platform, ...detail } });

    const { data: account } = await db.from('social_accounts').select('*').eq('business_id', business.id).eq('platform', platform).maybeSingle();
    if (!account || account.connection_status !== 'connected') {
      const error = platform === 'instagram' ? 'Instagram n\'est pas connecté.' : 'Facebook n\'est pas connecté.';
      await db.from('post_publications').update({ status: 'failed', error_message: error }).eq('id', pub.id);
      await log('skipped_not_connected');
      results.push({ platform, status: 'failed', error });
      continue;
    }
    if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
      await db.from('social_accounts').update({ connection_status: 'expired' }).eq('id', account.id);
      const error = 'Votre compte doit être reconnecté.';
      await db.from('post_publications').update({ status: 'failed', error_message: error }).eq('id', pub.id);
      results.push({ platform, status: 'failed', error });
      continue;
    }
    if (!img?.signedUrl) {
      results.push({ platform, status: 'failed', error: 'La photo est introuvable.' });
      continue;
    }

    await db.from('post_publications').update({ status: 'publishing', attempts: pub.attempts + 1 }).eq('id', pub.id);
    await log('publish_started', { attempt: pub.attempts + 1 });
    try {
      const token = await decrypt(account.encrypted_access_token);
      const r = platform === 'instagram'
        ? await publishInstagram(account.account_id, token, img.signedUrl, fullText)
        : await publishFacebook(account.page_id ?? account.account_id, token, img.signedUrl, fullText);
      const now = new Date().toISOString();
      await db.from('post_publications').update({ status: 'published', platform_post_id: r.id, platform_post_url: r.url, published_at: now, error_message: null }).eq('id', pub.id);
      await log('published', { platform_post_id: r.id });
      results.push({ platform, status: 'published', url: r.url, publishedAt: now });
    } catch (e) {
      const error = friendlyMetaError(e);
      if (e instanceof MetaError && e.tokenInvalid) await db.from('social_accounts').update({ connection_status: 'expired' }).eq('id', account.id);
      await db.from('post_publications').update({ status: 'failed', error_message: error }).eq('id', pub.id);
      await log('publish_failed', { code: e instanceof MetaError ? e.code : null, message: e instanceof Error ? e.message.slice(0, 300) : '' });
      results.push({ platform, status: 'failed', error });
    }
  }

  const ok = results.filter((r) => r.status === 'published').length;
  const status = ok === results.length ? 'published' : ok > 0 ? 'partially_published' : 'failed';
  await db.from('posts').update({ status, published_at: ok ? new Date().toISOString() : null }).eq('id', post.id);
  return json({ publications: results });
}));
