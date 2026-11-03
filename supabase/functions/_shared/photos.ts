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
