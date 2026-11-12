// Connexion Meta (OAuth officiel). Actions :
//  POST {action:'status'}               -> { configured }  (le bouton « Connecter » sait s'il peut servir)
//  POST {action:'start', redirect_uri}  -> { url }   (l'app ouvre cette URL Meta)
//  GET  ?code=...&state=...             -> callback Meta : échange du code, stockage CHIFFRÉ des jetons,
//                                          puis redirection vers l'app (vitrine://meta-connected ou la version web, ?status=ok|error|choose)
//  POST {action:'pending_pages'}        -> { pages: [{id, name, instagram}] }  (plusieurs Pages : le commerçant choisit)
//  POST {action:'choose_page', page_id} -> { ok, instagram }
//  POST {action:'disconnect', platform}
import { handler, json, HttpError, env } from '../_shared/http.ts';
import { admin, requireMerchant, requirePatron } from '../_shared/db.ts';
import { decrypt, encrypt, hmac } from '../_shared/crypto.ts';
import { graph, metaConfig, metaReady, META_SCOPES, GRAPH_VERSION } from '../_shared/meta.ts';

const callbackUrl = () => `${Deno.env.get('SUPABASE_URL')}/functions/v1/meta-oauth`;
/** Version web de Vitrine (vitrineappli.fr ; l'ancienne adresse GitHub reste acceptée). Seules adresses https acceptées pour le retour. */
const WEB_APP_URLS = () => [env('PUBLIC_APP_URL'), 'https://vitrineappli.fr/', 'https://kelianjouini-byte.github.io/vitrine/']
  .filter(Boolean).map((u) => (u as string).replace(/\/?$/, '/'));

/** Retour autorisé : l'appli (vitrine://), Expo Go en test (exp://), la version web officielle ou un test local. */
function allowedRedirect(r: string): boolean {
  if (/^(vitrine|exp):\/\//.test(r)) return true;
  if (/^http:\/\/localhost(:\d+)?\//.test(r)) return true;
  return WEB_APP_URLS().some((u) => r.startsWith(u));
}

Deno.serve(handler(async (req) => {
  if (req.method === 'GET') return callback(req);
  const body = await req.json().catch(() => ({}));
  if (body.action === 'status') return json({ configured: metaReady() });
  const { appId, appSecret } = metaConfig();
  const { db, business, member } = await requireMerchant(req);
  // Connecter ou déconnecter Instagram / Facebook : seulement un patron (chaque boutique a ses propres comptes).
  requirePatron(member);

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

  if (body.action === 'pending_pages') {
    // La liste des Pages à choisir, SANS les jetons.
    const pending = await readPending(business.id);
    return json({ pages: (pending?.pages ?? []).map((p) => ({ id: p.id, name: p.name, instagram: p.ig?.username ? `@${p.ig.username}` : p.ig ? 'Instagram' : null })) });
  }

  if (body.action === 'choose_page') {
    const pending = await readPending(business.id);
    const page = pending?.pages.find((p) => p.id === String(body.page_id ?? ''));
    if (!pending || !page) throw new HttpError(410, 'choice_expired', 'Le choix a expiré. Reconnectez votre compte.');
    const hasIg = await saveConnection(db, { businessId: business.id, metaUserId: pending.metaUserId, granted: pending.granted }, page);
    await db.from('meta_pending_pages').delete().eq('business_id', business.id);
    return json({ ok: true, instagram: hasIg });
  }

  if (body.action === 'disconnect') {
    const platform = body.platform === 'facebook' ? 'facebook' : 'instagram';
    await db.from('social_accounts').delete().eq('business_id', business.id).eq('platform', platform);
    return json({ ok: true });
  }
  throw new HttpError(400, 'bad_action', 'Action inconnue.');
}));

interface PendingPage { id: string; name: string; token: string; ig: { id: string; username?: string } | null }
interface Connection { businessId: string; metaUserId: string; granted: string[] }
type MetaPage = { id: string; name: string; access_token: string; instagram_business_account?: { id: string; username?: string } };

const toPending = (p: MetaPage): PendingPage => ({ id: p.id, name: p.name, token: p.access_token, ig: p.instagram_business_account ?? null });

/** Pages en attente de choix pour cette boutique (null si rien ou expiré). */
async function readPending(businessId: string) {
  const { data } = await admin().from('meta_pending_pages').select('*').eq('business_id', businessId).maybeSingle();
  if (!data || new Date(data.expires_at) < new Date()) return null;
  return { pages: JSON.parse(await decrypt(data.encrypted_pages)) as PendingPage[], metaUserId: data.meta_user_id as string, granted: data.granted_scopes as string[] };
}

/**
 * Enregistre la Page choisie (Facebook) et son Instagram professionnel lié. Remplace l'ancienne connexion.
 * Le jeton de Page issu d'un jeton long n'expire pas. Retourne true si un Instagram est relié.
 */
async function saveConnection(db: ReturnType<typeof admin>, c: Connection, page: PendingPage): Promise<boolean> {
  const base = { business_id: c.businessId, granted_scopes: c.granted, meta_user_id: c.metaUserId, connection_status: 'connected', token_expires_at: null };
  const encrypted = await encrypt(page.token);
  await db.from('social_accounts').delete().eq('business_id', c.businessId);
  if (c.granted.includes('pages_manage_posts')) {
    await db.from('social_accounts').insert({ ...base, platform: 'facebook', account_id: page.id, page_id: page.id, account_name: page.name, encrypted_access_token: encrypted });
  }
  if (page.ig && c.granted.includes('instagram_content_publish')) {
    await db.from('social_accounts').insert({ ...base, platform: 'instagram', account_id: page.ig.id, page_id: page.id, account_name: page.ig.username ? `@${page.ig.username}` : page.name, encrypted_access_token: encrypted });
  }
  return !!page.ig;
}

async function callback(req: Request): Promise<Response> {
  const { appId, appSecret } = metaConfig();
  const params = new URL(req.url).searchParams;
  const [payload, sig] = (params.get('state') ?? '').split('.');
  if (!payload || sig !== (await hmac(payload, appSecret))) return new Response('Lien invalide.', { status: 400 });
  const state = JSON.parse(atob(payload)) as { b: string; r: string; e: number };
  const back = (status: 'ok' | 'error' | 'choose', reason?: string) =>
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
    const pages = await graph<{ data: MetaPage[] }>(
      'me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: long.access_token });
    if (!pages.data.length) return back('error', 'no_page');
    const db = admin();
    const conn: Connection = { businessId: state.b, metaUserId: me.id, granted };
    // Une seule Page : on la prend. Plusieurs : le commerçant choisit dans Vitrine (« Sur quelle Page publier ? »).
    if (pages.data.length === 1) {
      const hasIg = await saveConnection(db, conn, toPending(pages.data[0]));
      return back(hasIg ? 'ok' : 'error', hasIg ? undefined : 'no_instagram');
    }
    // Les jetons de Page restent CHIFFRÉS en attendant le choix (30 minutes maximum).
    await db.from('meta_pending_pages').upsert({
      business_id: state.b,
      meta_user_id: me.id,
      granted_scopes: granted,
      encrypted_pages: await encrypt(JSON.stringify(pages.data.slice(0, 50).map(toPending))),
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    }, { onConflict: 'business_id' });
    return back('choose');
  } catch (e) {
    console.error('[vitrine] meta callback', e instanceof Error ? e.message : '');
    return back('error', 'meta');
  }
}
