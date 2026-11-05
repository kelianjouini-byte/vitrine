// Connexion Meta (OAuth officiel). Quatre actions :
//  POST {action:'status'}               -> { configured }  (le bouton « Connecter » sait s'il peut servir)
//  POST {action:'start', redirect_uri}  -> { url }   (l'app ouvre cette URL Meta)
//  GET  ?code=...&state=...             -> callback Meta : échange du code, stockage CHIFFRÉ des jetons,
//                                          puis redirection vers l'app (vitrine://meta-connected ou la version web, ?status=ok|error)
//  POST {action:'disconnect', platform}
import { handler, json, HttpError, env } from '../_shared/http.ts';
import { admin, requireMerchant } from '../_shared/db.ts';
import { encrypt, hmac } from '../_shared/crypto.ts';
import { graph, metaConfig, metaReady, META_SCOPES, GRAPH_VERSION } from '../_shared/meta.ts';

const callbackUrl = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-oauth`;
/** Version web de Vitrine (GitHub Pages par défaut). Seule adresse https acceptée pour le retour. */
const WEB_APP_URL = () => env('PUBLIC_APP_URL') ?? 'https://kelianjouini-byte.github.io/vitrine/';

/** Retour autorisé : l'appli (vitrine://), Expo Go en test (exp://), la version web officielle ou un test local. */
function allowedRedirect(r: string): boolean {
  if (/^(vitrine|exp):\/\//.test(r)) return true;
  if (/^http:\/\/localhost(:\d+)?\//.test(r)) return true;
  return r.startsWith(WEB_APP_URL());
}

Deno.serve(handler(async (req) => {
  if (req.method === 'GET') return callback(req);
  const body = await req.json().catch(() => ({}));
  if (body.action === 'status') return json({ configured: metaReady() });
  const { appId, appSecret } = metaConfig();
  const { db, business } = await requireMerchant(req);

  if (body.action === 'start') {
    const redirect = String(body.redirect_uri ?? '');
    if (!allowedRedirect(redirect)) throw new HttpError(400, 'bad_redirect', 'Adresse de retour invalide.');
    const payload = btoa(JSON.stringify({ b: business.id, r: redirect, e: Date.now() + 10 * 60_000 }));
    const state = `${payload}.${await hmac(payload, appSecret)}`;
    const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('redirect_uri', callbackUrl());
    url.searchParams.set('state', state);
    url.searchParams.set('scope', META_SCOPES.join(','));
    url.searchParams.set('response_type', 'code');
    if (env('META_CONFIG_ID')) url.searchParams.set('config_id', env('META_CONFIG_ID')!); // Facebook Login for Business
    return json({ url: url.toString() });
  }

  if (body.action === 'disconnect') {
    const platform = body.platform === 'facebook' ? 'facebook' : 'instagram';
    await db.from('social_accounts').delete().eq('business_id', business.id).eq('platform', platform);
    return json({ ok: true });
  }
  throw new HttpError(400, 'bad_action', 'Action inconnue.');
}));

async function callback(req: Request): Promise<Response> {
  const { appId, appSecret } = metaConfig();
  const params = new URL(req.url).searchParams;
  const [payload, sig] = (params.get('state') ?? '').split('.');
  if (!payload || sig !== (await hmac(payload, appSecret))) return new Response('Lien invalide.', { status: 400 });
  const state = JSON.parse(atob(payload)) as { b: string; r: string; e: number };
  const back = (status: 'ok' | 'error', reason?: string) =>
    Response.redirect(`${state.r}${state.r.includes('?') ? '&' : '?'}status=${status}${reason ? `&reason=${reason}` : ''}`, 302);
  if (Date.now() > state.e) return back('error', 'expired');
  const code = params.get('code');
  if (!code) return back('error', params.get('error') ?? 'denied');

  try {
    // 1. code -> jeton utilisateur court, puis jeton long (~60 jours)
    const short = await graph<{ access_token: string }>('oauth/access_token', { client_id: appId, client_secret: appSecret, redirect_uri: callbackUrl(), code });
    const long = await graph<{ access_token: string; expires_in?: number }>('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: short.access_token });
    const me = await graph<{ id: string }>('me', { fields: 'id', access_token: long.access_token });
    const perms = await graph<{ data: { permission: string; status: string }[] }>('me/permissions', { access_token: long.access_token });
    const granted = perms.data.filter((p) => p.status === 'granted').map((p) => p.permission);

    // 2. Pages gérées + compte Instagram professionnel lié
    const pages = await graph<{ data: { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } }[] }>(
      'me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: long.access_token });
    if (!pages.data.length) return back('error', 'no_page');
    // MVP : première Page (choix de la Page à ajouter si plusieurs). Le jeton de Page issu d'un jeton long n'expire pas.
    const page = pages.data.find((p) => p.instagram_business_account) ?? pages.data[0];
    const db = admin();
    const base = { business_id: state.b, granted_scopes: granted, meta_user_id: me.id, connection_status: 'connected', token_expires_at: null };
    const encrypted = await encrypt(page.access_token);

    if (granted.includes('pages_manage_posts')) {
      await db.from('social_accounts').upsert({ ...base, platform: 'facebook', account_id: page.id, page_id: page.id, account_name: page.name, encrypted_access_token: encrypted }, { onConflict: 'business_id,platform' });
    }
    if (page.instagram_business_account && granted.includes('instagram_content_publish')) {
      await db.from('social_accounts').upsert({ ...base, platform: 'instagram', account_id: page.instagram_business_account.id, page_id: page.id, account_name: page.instagram_business_account.username ? `@${page.instagram_business_account.username}` : page.name, encrypted_access_token: encrypted }, { onConflict: 'business_id,platform' });
    }
    return back(page.instagram_business_account ? 'ok' : 'error', page.instagram_business_account ? undefined : 'no_instagram');
  } catch (e) {
    console.error('[vitrine] meta callback', e instanceof Error ? e.message : '');
    return back('error', 'meta');
  }
}
