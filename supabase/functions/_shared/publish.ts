// Envoi d'une publication (post ou story) sur chaque réseau, en commun pour publish-post et publish-story.
// Idempotent : une ligne post_publications par (publication, réseau) ; ce qui est déjà publié n'est JAMAIS renvoyé à Meta.
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { decrypt } from './crypto.ts';
import { friendlyMetaError, MetaError } from './meta.ts';

export type Platform = 'instagram' | 'facebook';

export interface SocialAccount {
  id: string;
  account_id: string;
  page_id: string | null;
  encrypted_access_token: string;
  connection_status: string;
  token_expires_at: string | null;
}

export interface PublicationResult {
  platform: Platform;
  /** pending = envoi en cours en arrière-plan (résultat lu plus tard dans la base). */
  status: 'published' | 'failed' | 'pending';
  url?: string | null;
  error?: string;
  publishedAt?: string;
}

/** Garde uniquement « instagram » et « facebook ». */
export function readPlatforms(raw: unknown): Platform[] {
  return (Array.isArray(raw) ? raw : []).filter((p): p is Platform => p === 'instagram' || p === 'facebook');
}

export async function sendToNetworks(opts: {
  db: SupabaseClient;
  businessId: string;
  postId: string;
  platforms: Platform[];
  idempotencyKey: string;
  /** Message d'erreur si les fichiers sont introuvables (null = tout va bien). */
  mediaError: string | null;
  send: (platform: Platform, account: SocialAccount, token: string) => Promise<{ id: string; url: string | null }>;
}): Promise<PublicationResult[]> {
  const { db, businessId, postId, platforms, idempotencyKey, mediaError, send } = opts;

  // Les réseaux sont servis en même temps : une vidéo longue à préparer chez Instagram ne retarde pas Facebook.
  const one = async (platform: Platform): Promise<PublicationResult> => {
    await db.from('post_publications').upsert({ post_id: postId, platform, idempotency_key: idempotencyKey }, { onConflict: 'post_id,platform', ignoreDuplicates: true });
    const { data: pub } = await db.from('post_publications').select('*').eq('post_id', postId).eq('platform', platform).single();
    if (pub.status === 'published') { // déjà fait : on ne republie pas
      return { platform, status: 'published', url: pub.platform_post_url, publishedAt: pub.published_at };
    }
    const log = (kind: string, detail: Record<string, unknown> = {}) => db.from('post_events').insert({ post_id: postId, kind, detail: { platform, ...detail } });
    const fail = async (error: string): Promise<PublicationResult> => {
      await db.from('post_publications').update({ status: 'failed', error_message: error }).eq('id', pub.id);
      return { platform, status: 'failed', error };
    };

    const { data: account } = await db.from('social_accounts').select('*').eq('business_id', businessId).eq('platform', platform).maybeSingle<SocialAccount>();
    if (!account || account.connection_status !== 'connected') {
      await log('skipped_not_connected');
      return fail(platform === 'instagram' ? 'Instagram n\'est pas connecté.' : 'Facebook n\'est pas connecté.');
    }
    if (account.token_expires_at && new Date(account.token_expires_at) < new Date()) {
      await db.from('social_accounts').update({ connection_status: 'expired' }).eq('id', account.id);
      return fail('Votre compte doit être reconnecté.');
    }
    if (mediaError) return fail(mediaError);

    await db.from('post_publications').update({ status: 'publishing', attempts: pub.attempts + 1 }).eq('id', pub.id);
    await log('publish_started', { attempt: pub.attempts + 1 });
    try {
      const token = await decrypt(account.encrypted_access_token);
      const r = await send(platform, account, token);
      const now = new Date().toISOString();
      await db.from('post_publications').update({ status: 'published', platform_post_id: r.id, platform_post_url: r.url, published_at: now, error_message: null }).eq('id', pub.id);
      await log('published', { platform_post_id: r.id });
      return { platform, status: 'published', url: r.url, publishedAt: now };
    } catch (e) {
      if (e instanceof MetaError && e.tokenInvalid) await db.from('social_accounts').update({ connection_status: 'expired' }).eq('id', account.id);
      await log('publish_failed', { code: e instanceof MetaError ? e.code : null, message: e instanceof Error ? e.message.slice(0, 300) : '' });
      return fail(friendlyMetaError(e));
    }
  };
  const results = await Promise.all(platforms.map(one));

  const ok = results.filter((r) => r.status === 'published').length;
  const status = ok === results.length ? 'published' : ok > 0 ? 'partially_published' : 'failed';
  await db.from('posts').update({ status, published_at: ok ? new Date().toISOString() : null }).eq('id', postId);
  return results;
}
