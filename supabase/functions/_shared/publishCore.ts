// Publication d'un post ou d'une story déjà enregistré(e), commune à publish-post, publish-story
// et à la validation par un patron (fonction team). Verrou + idempotence : voir publish.ts.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { HttpError } from './http.ts';
import { postImagePaths } from './photos.ts';
import { publishFacebook, publishFacebookStory, publishInstagram, publishInstagramStory } from './meta.ts';
import { sendToNetworks, type Platform, type PublicationResult } from './publish.ts';

/** Publie un post (photos + texte). paths vide = les photos déjà enregistrées avec le post. */
export async function publishSavedPost(opts: {
  db: SupabaseClient;
  businessId: string;
  postId: string;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  paths: string[];
  key: string;
  /** Champs à enregistrer en même temps que le verrou (ex. validation par le patron). */
  extra?: Record<string, unknown>;
}): Promise<PublicationResult[]> {
  const { db, businessId, postId, caption, hashtags, platforms, paths: newPaths, key } = opts;
  const { data: post } = await db.from('posts').select('*').eq('id', postId).eq('business_id', businessId).maybeSingle();
  if (!post) throw new HttpError(404, 'not_found', 'Publication introuvable.');
  if (post.status === 'publishing') throw new HttpError(409, 'in_progress', 'Cette publication est déjà en cours.');

  // Verrou : passage atomique en « publishing » (empêche deux envois simultanés).
  const photoUpdate = newPaths.length ? { image_url: newPaths[0], image_urls: newPaths } : {};
  const { data: locked } = await db.from('posts').update({ status: 'publishing', instagram_caption: caption, facebook_caption: caption, hashtags, platforms, ...photoUpdate, ...(opts.extra ?? {}) })
    .eq('id', post.id).neq('status', 'publishing').select('id').maybeSingle();
  if (!locked) throw new HttpError(409, 'in_progress', 'Cette publication est déjà en cours.');

  const fullText = `${caption}\n\n${hashtags.join(' ')}`.trim();
  const paths = newPaths.length ? newPaths : postImagePaths(post);
  const { data: signed } = await db.storage.from('post-images').createSignedUrls(paths, 3600);
  const imageUrls = (signed ?? []).map((x) => x.signedUrl).filter((u): u is string => !!u);
  const mediaError = imageUrls.length === paths.length ? null : paths.length > 1 ? 'Une des photos est introuvable.' : 'La photo est introuvable.';

  return sendToNetworks({
    db, businessId, postId: post.id, platforms, idempotencyKey: key, mediaError,
    send: (platform, account, token) => platform === 'instagram'
      ? publishInstagram(account.account_id, token, imageUrls, fullText)
      : publishFacebook(account.page_id ?? account.account_id, token, imageUrls, fullText),
  });
}

/** Publie une story déjà enregistrée (photo ou vidéo dans le stockage privé). */
export async function publishSavedStory(opts: {
  db: SupabaseClient;
  businessId: string;
  postId: string;
  path: string;
  kind: 'photo' | 'video';
  platforms: Platform[];
  key: string;
  extra?: Record<string, unknown>;
}): Promise<PublicationResult[]> {
  const { db, businessId, postId, path, kind, platforms, key } = opts;
  const { data: locked } = await db.from('posts').update({ status: 'publishing', image_url: path, media_type: kind, platforms, ...(opts.extra ?? {}) })
    .eq('id', postId).eq('business_id', businessId).neq('status', 'publishing').select('id').maybeSingle();
  if (!locked) throw new HttpError(409, 'in_progress', 'Cette story est déjà en cours d\'envoi.');

  const { data: signed } = await db.storage.from('post-images').createSignedUrl(path, 3600);
  const media = { kind, url: signed?.signedUrl ?? '' } as const;
  const mediaError = media.url ? null : kind === 'video' ? 'La vidéo est introuvable.' : 'La photo est introuvable.';

  return sendToNetworks({
    db, businessId, postId, platforms, idempotencyKey: key, mediaError,
    send: (platform, account, token) => platform === 'instagram'
      ? publishInstagramStory(account.account_id, token, media)
      : publishFacebookStory(account.page_id ?? account.account_id, token, media),
  });
}
