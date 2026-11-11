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
  // Statistiques (bilan du mois) et commentaires (lire / répondre).
  'read_insights',
  'pages_read_user_content',
  'pages_manage_engagement',
  'instagram_manage_insights',
  'instagram_manage_comments',
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
    if (e.code === 9004 || e.code === 36003) return 'La photo ou la vidéo n\'a pas été acceptée (format ou taille).';
  }
  return 'La publication a échoué. Réessayez.';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Meta dit-il que les clés sont posées ? (sans rien lever : sert au bouton « Connecter »). */
export function metaReady(): boolean {
  return !!(env('META_APP_ID') && env('META_APP_SECRET') && env('TOKEN_ENCRYPTION_KEY'));
}

/** Attend qu'Instagram ait fini de préparer un conteneur (photo, carrousel ou vidéo, plus longue). */
async function waitContainer(id: string, token: string, tries = 10) {
  for (let i = 0; i < tries; i++) {
    const s = await graph<{ status_code: string }>(id, { fields: 'status_code', access_token: token });
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new MetaError(9004, undefined, `conteneur ${s.status_code}`, false);
    await sleep(1500);
  }
  // Pas encore prêt : on tente quand même la publication, Meta dira si c'est trop tôt.
}

/**
 * Instagram : conteneur média -> attente -> publication -> lien.
 * Plusieurs photos : un conteneur par photo (« élément de carrousel »), puis un conteneur CAROUSEL qui les regroupe.
 */
export async function publishInstagram(igUserId: string, token: string, imageUrls: string[], caption: string) {
  let containerId: string;
  if (imageUrls.length === 1) {
    containerId = (await graph<{ id: string }>(`${igUserId}/media`, { image_url: imageUrls[0], caption, access_token: token }, 'POST')).id;
  } else {
    const children: string[] = [];
    for (const url of imageUrls) {
      children.push((await graph<{ id: string }>(`${igUserId}/media`, { image_url: url, is_carousel_item: 'true', access_token: token }, 'POST')).id);
    }
    for (const id of children) await waitContainer(id, token);
    containerId = (await graph<{ id: string }>(`${igUserId}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption, access_token: token }, 'POST')).id;
  }
  await waitContainer(containerId, token);
  const published = await graph<{ id: string }>(`${igUserId}/media_publish`, { creation_id: containerId, access_token: token }, 'POST');
  const info = await graph<{ permalink?: string }>(published.id, { fields: 'permalink', access_token: token }).catch(() => ({ permalink: undefined }));
  return { id: published.id, url: info.permalink ?? null };
}

/**
 * Facebook : photo publiée sur la Page autorisée.
 * Plusieurs photos : chaque photo est envoyée sans être publiée, puis un seul post les rassemble.
 */
export async function publishFacebook(pageId: string, pageToken: string, imageUrls: string[], message: string) {
  if (imageUrls.length === 1) {
    const res = await graph<{ id: string; post_id?: string }>(`${pageId}/photos`, { url: imageUrls[0], message, published: 'true', access_token: pageToken }, 'POST');
    const postId = res.post_id ?? res.id;
    return { id: postId, url: `https://www.facebook.com/${postId}` };
  }
  const params: Record<string, string> = { message, access_token: pageToken };
  for (const [i, url] of imageUrls.entries()) {
    const photo = await graph<{ id: string }>(`${pageId}/photos`, { url, published: 'false', access_token: pageToken }, 'POST');
    params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: photo.id });
  }
  const res = await graph<{ id: string }>(`${pageId}/feed`, params, 'POST');
  return { id: res.id, url: `https://www.facebook.com/${res.id}` };
}

// ------------------------------------------------------------------ Stories

export type StoryMedia = { kind: 'photo' | 'video'; url: string };

/** Instagram : story photo ou vidéo (media_type STORIES), puis publication. Une story n'a pas de lien public. */
export async function publishInstagramStory(igUserId: string, token: string, media: StoryMedia) {
  const params: Record<string, string> = { media_type: 'STORIES', access_token: token };
  params[media.kind === 'video' ? 'video_url' : 'image_url'] = media.url;
  const container = await graph<{ id: string }>(`${igUserId}/media`, params, 'POST');
  // Une vidéo peut demander jusqu'à ~1 min de préparation chez Instagram.
  await waitContainer(container.id, token, media.kind === 'video' ? 45 : 10);
  const published = await graph<{ id: string }>(`${igUserId}/media_publish`, { creation_id: container.id, access_token: token }, 'POST');
  return { id: published.id, url: null };
}

/**
 * Facebook : story de Page.
 * Photo : photo envoyée sans être publiée, puis /photo_stories.
 * Vidéo : 3 temps (start -> Meta va chercher le fichier à notre adresse -> finish).
 */
export async function publishFacebookStory(pageId: string, pageToken: string, media: StoryMedia) {
  if (media.kind === 'photo') {
    const photo = await graph<{ id: string }>(`${pageId}/photos`, { url: media.url, published: 'false', access_token: pageToken }, 'POST');
    const res = await graph<{ post_id?: string }>(`${pageId}/photo_stories`, { photo_id: photo.id, access_token: pageToken }, 'POST');
    return { id: res.post_id ?? photo.id, url: null };
  }
  const start = await graph<{ video_id: string; upload_url?: string }>(`${pageId}/video_stories`, { upload_phase: 'start', access_token: pageToken }, 'POST');
  const uploadUrl = start.upload_url ?? `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}/${start.video_id}`;
  const up = await fetch(uploadUrl, { method: 'POST', headers: { Authorization: `OAuth ${pageToken}`, file_url: media.url } });
  const upData = await up.json().catch(() => ({}));
  if (!up.ok || upData.error || upData.success === false) {
    const e = upData.error ?? {};
    throw new MetaError(e.code ?? 9004, e.error_subcode, e.message ?? `envoi vidéo ${up.status}`, e.code === 190);
  }
  const res = await graph<{ post_id?: string }>(`${pageId}/video_stories`, { upload_phase: 'finish', video_id: start.video_id, access_token: pageToken }, 'POST');
  return { id: res.post_id ?? start.video_id, url: null };
}
