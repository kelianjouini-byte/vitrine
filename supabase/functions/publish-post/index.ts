// POST { post_id, caption, hashtags[], platforms[], image_paths[]?, idempotency_key }
// -> { publications: [{ platform, status, url, error, publishedAt }] }
// Idempotent : une publication déjà réussie n'est JAMAIS renvoyée à Meta (voir _shared/publish.ts).
import { requireAccess } from '../_shared/access.ts';
import { handler, json, HttpError } from '../_shared/http.ts';
import { requireMerchant } from '../_shared/db.ts';
import { postImagePaths, readImagePaths } from '../_shared/photos.ts';
import { metaConfig, publishInstagram, publishFacebook } from '../_shared/meta.ts';
import { readPlatforms, sendToNetworks } from '../_shared/publish.ts';

Deno.serve(handler(async (req) => {
  metaConfig(); // lève meta_not_configured si les secrets Meta manquent
  const { db, userId, business } = await requireMerchant(req);
  await requireAccess(db, business);
  const body = await req.json().catch(() => ({}));
  const platforms = readPlatforms(body.platforms);
  const caption = String(body.caption ?? '').trim().slice(0, 2000);
  const hashtags = (Array.isArray(body.hashtags) ? body.hashtags : []).map(String).slice(0, 30);
  const key = String(body.idempotency_key ?? '');
  if (!platforms.length || !caption || key.length < 16) throw new HttpError(400, 'bad_request', 'Publication incomplète.');
  // Photos envoyées par l'appli : le commerçant a pu les changer (ordre, ajout, retrait) après le texte.
  const newPaths = readImagePaths(body, userId, false);

  const { data: post } = await db.from('posts').select('*').eq('id', body.post_id).eq('business_id', business.id).maybeSingle();
  if (!post) throw new HttpError(404, 'not_found', 'Publication introuvable.');
  if (post.status === 'publishing') throw new HttpError(409, 'in_progress', 'Cette publication est déjà en cours.');

  // Verrou : passage atomique en « publishing » (empêche deux envois simultanés).
  const photoUpdate = newPaths.length ? { image_url: newPaths[0], image_urls: newPaths } : {};
  const { data: locked } = await db.from('posts').update({ status: 'publishing', instagram_caption: caption, facebook_caption: caption, hashtags, ...photoUpdate })
    .eq('id', post.id).neq('status', 'publishing').select('id').maybeSingle();
  if (!locked) throw new HttpError(409, 'in_progress', 'Cette publication est déjà en cours.');

  const fullText = `${caption}\n\n${hashtags.join(' ')}`.trim();
  const paths = newPaths.length ? newPaths : postImagePaths(post);
  const { data: signed } = await db.storage.from('post-images').createSignedUrls(paths, 3600);
  const imageUrls = (signed ?? []).map((x) => x.signedUrl).filter((u): u is string => !!u);
  const mediaError = imageUrls.length === paths.length ? null : paths.length > 1 ? 'Une des photos est introuvable.' : 'La photo est introuvable.';

  const publications = await sendToNetworks({
    db, businessId: business.id, postId: post.id, platforms, idempotencyKey: key, mediaError,
    send: (platform, account, token) => platform === 'instagram'
      ? publishInstagram(account.account_id, token, imageUrls, fullText)
      : publishFacebook(account.page_id ?? account.account_id, token, imageUrls, fullText),
  });
  return json({ publications });
}));
