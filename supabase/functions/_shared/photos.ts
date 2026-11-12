// Photos d'une publication : lecture et contrôle des chemins envoyés par l'appli.
import { HttpError } from './http.ts';

/** Instagram et Facebook acceptent jusqu'à 10 photos dans un carrousel. */
export const MAX_PHOTOS = 10;

/**
 * Lit `image_paths` (carrousel) ou, pour une ancienne version de l'appli, `image_path`.
 * Chaque photo doit être dans le dossier de l'utilisateur (validation d'accès).
 * `required` = false : retourne une liste vide si l'appli n'a envoyé aucune photo.
 */
export function readImagePaths(body: Record<string, unknown>, userId: string, required = true): string[] {
  const raw = Array.isArray(body.image_paths) && body.image_paths.length ? body.image_paths : body.image_path ? [body.image_path] : [];
  if (!raw.length && !required) return [];
  const paths = raw.map((p) => String(p ?? ''));
  if (!paths.length || paths.length > MAX_PHOTOS) throw new HttpError(400, 'bad_image', `Choisissez entre 1 et ${MAX_PHOTOS} photos.`);
  for (const p of paths) {
    if (!p.startsWith(`${userId}/`) || p.includes('..') || p.length > 200) throw new HttpError(400, 'bad_image', 'Photo invalide.');
  }
  return paths;
}

/** Photos d'un post enregistré, dans l'ordre (les anciens posts n'ont que image_url). */
export function postImagePaths(post: { image_url: string; image_urls?: string[] | null }): string[] {
  return post.image_urls?.length ? post.image_urls : [post.image_url];
}

/**
 * Reel envoyé par l'appli : `video_path` (MP4 ou MOV) et `cover_path` (image tirée de la vidéo, facultative).
 * Retourne null si l'appli n'a pas envoyé de vidéo (post photo classique).
 */
export function readReelPaths(body: Record<string, unknown>, userId: string): { video: string; cover: string | null } | null {
  if (!body.video_path) return null;
  const video = String(body.video_path);
  const cover = body.cover_path ? String(body.cover_path) : null;
  const ok = (p: string, ext: RegExp) => p.startsWith(`${userId}/`) && !p.includes('..') && p.length <= 200 && ext.test(p);
  if (!ok(video, /\.(mp4|mov)$/i)) throw new HttpError(400, 'bad_media', 'Vidéo invalide.');
  if (cover && !ok(cover, /\.jpg$/i)) throw new HttpError(400, 'bad_image', 'Image de la vidéo invalide.');
  return { video, cover };
}
