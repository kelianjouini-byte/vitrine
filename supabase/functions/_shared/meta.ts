// Appels à l'API officielle Meta Graph (Facebook + Instagram). Aucune API non officielle.
import { env, HttpError } from './http.ts';

export const GRAPH_VERSION = env('META_GRAPH_VERSION') ?? 'v23.0';
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Permissions demandées — à revérifier dans la documentation Meta à jour avant la revue. */
export const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'instagram_basic',
  'instagram_content_publish',
  'business_management',
];

export function metaConfig() {
  const appId = env('META_APP_ID');
  const appSecret = env('META_APP_SECRET');
  if (!appId || !appSecret || !env('TOKEN_ENCRYPTION_KEY')) {
    throw new HttpError(503, 'meta_not_configured', 'La connexion Meta n\'est pas encore configurée.');
  }
  return { appId, appSecret };
}

export class MetaError extends Error {
  constructor(public code: number | undefined, public subcode: number | undefined, message: string, public tokenInvalid: boolean) {
    super(message);
  }
}

export async function graph<T>(path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, '')}`);
  let body: URLSearchParams | undefined;
  if (method === 'GET') Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  else body = new URLSearchParams(params);
  const res = await fetch(url, { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    // 190 = jeton invalide/expiré ; 10 / 200-299 = permission manquante
    const tokenInvalid = e.code === 190 || e.code === 102;
    throw new MetaError(e.code, e.error_subcode, e.message ?? `Erreur Meta ${res.status}`, tokenInvalid);
  }
  return data as T;
}

/** Message simple pour le commerçant à partir d'une erreur Meta. */
export function friendlyMetaError(e: unknown): string {
  if (e instanceof MetaError) {
    if (e.tokenInvalid) return 'Votre compte doit être reconnecté.';
    if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) return 'Trop de publications en peu de temps. Réessayez plus tard.';
    if (e.code === 10 || (e.code && e.code >= 200 && e.code < 300)) return 'Vitrine n\'a pas l\'autorisation de publier. Reconnectez votre compte.';
    if (e.code === 9004 || e.code === 36003) return 'La photo n\'a pas été acceptée (format ou taille).';
  }
  return 'La publication a échoué. Réessayez.';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Instagram : conteneur média -> attente -> publication -> lien. */
export async function publishInstagram(igUserId: string, token: string, imageUrl: string, caption: string) {
  const container = await graph<{ id: string }>(`${igUserId}/media`, { image_url: imageUrl, caption, access_token: token }, 'POST');
  for (let i = 0; i < 10; i++) {
    const s = await graph<{ status_code: string }>(container.id, { fields: 'status_code', access_token: token });
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new MetaError(9004, undefined, `conteneur ${s.status_code}`, false);
    await sleep(1500);
  }
  const published = await graph<{ id: string }>(`${igUserId}/media_publish`, { creation_id: container.id, access_token: token }, 'POST');
  const info = await graph<{ permalink?: string }>(published.id, { fields: 'permalink', access_token: token }).catch(() => ({ permalink: undefined }));
  return { id: published.id, url: info.permalink ?? null };
}

/** Facebook : photo publiée sur la Page autorisée. */
export async function publishFacebook(pageId: string, pageToken: string, imageUrl: string, message: string) {
  const res = await graph<{ id: string; post_id?: string }>(`${pageId}/photos`, { url: imageUrl, message, published: 'true', access_token: pageToken }, 'POST');
  const postId = res.post_id ?? res.id;
  return { id: postId, url: `https://www.facebook.com/${postId}` };
}
