/**
 * Historique des posts : ce qui est sur le serveur est recopié sur le téléphone.
 * Ainsi « Mes posts » et « Mon bilan » restent justes après un changement de téléphone.
 * Fichier « pur » (aucune dépendance React Native) : testé avec node --test.
 */
import type { Platform, Post, PostStatus, PublicationResult } from './types';

/** Un post tel qu'il est enregistré sur le serveur (table posts + post_publications). */
export interface RemotePost {
  id: string;
  status: PostStatus;
  /** « story » ou « post » ; un post en vidéo est un Reel. Absents : ancien serveur (post photo). */
  kind?: 'post' | 'story';
  media_type?: 'photo' | 'video';
  instagram_caption: string | null;
  hashtags: string[] | null;
  image_urls: string[] | null;
  created_at: string;
  published_at: string | null;
  /** Validation par un patron (post d'un employé). */
  review_state?: 'pending' | 'approved' | 'rejected' | null;
  review_note?: string | null;
  publications: {
    platform: Platform;
    status: 'pending' | 'publishing' | 'published' | 'failed';
    platform_post_url: string | null;
    error_message: string | null;
    published_at: string | null;
  }[];
  /** Lien temporaire vers la 1re photo (le stockage est privé). */
  imageUrl?: string | null;
}

/** Statuts qui comptent dans l'historique : le serveur a vraiment essayé de publier. */
const FINAL: PostStatus[] = ['published', 'partially_published', 'failed'];
/** Seuls les posts publiés sont ajoutés depuis le serveur (un échec ancien n'a pas sa place dans l'historique). */
const IMPORT: PostStatus[] = ['published', 'partially_published'];

function toPublications(r: RemotePost): PublicationResult[] {
  return r.publications.map((p) => ({
    platform: p.platform,
    status: p.status === 'published' ? 'published' : p.status === 'failed' ? 'failed' : 'pending',
    url: p.platform_post_url,
    error: p.error_message,
    publishedAt: p.published_at,
  }));
}

/**
 * Fusionne l'historique du téléphone et celui du serveur.
 * - Un post connu des deux côtés : le serveur fait foi pour le résultat de la publication.
 * - Un post publié qui n'existe que sur le serveur (autre téléphone) : il est ajouté.
 * - Les posts propres au téléphone (stories, posts prévus, brouillons) sont gardés tels quels.
 */
export function mergePosts(local: Post[], remote: RemotePost[]): Post[] {
  const byId = new Map(local.map((p) => [p.id, p]));
  for (const r of remote) {
    const mine = byId.get(r.id);
    if (mine) {
      // Post envoyé au patron et refusé : on le dit à l'employé, avec le petit mot du patron.
      if (r.review_state === 'rejected' && mine.reviewState !== 'rejected') {
        byId.set(r.id, { ...mine, status: 'cancelled', reviewState: 'rejected', reviewNote: r.review_note ?? null });
        continue;
      }
      if (!FINAL.includes(r.status)) continue;
      const pubs = toPublications(r);
      byId.set(r.id, {
        ...mine,
        status: r.status,
        publishedAt: r.published_at ?? mine.publishedAt ?? null,
        publications: pubs.length ? pubs : mine.publications,
        reviewState: r.review_state ?? mine.reviewState ?? null,
        // Photo gardée sur ce téléphone : on la garde ; sinon, lien du serveur (renouvelé à chaque ouverture).
        imageUri: (mine.imageUri && !/^https?:/.test(mine.imageUri)) || (r.kind === 'story' && r.media_type === 'video') ? mine.imageUri : r.imageUrl ?? mine.imageUri ?? '',
      });
      continue;
    }
    if (!IMPORT.includes(r.status)) continue;
    const pubs = toPublications(r);
    byId.set(r.id, {
      id: r.id,
      kind: r.kind ?? 'post',
      mediaType: r.media_type ?? 'photo',
      // Story vidéo : pas d'image (le lien serait celui de la vidéo). Reel : la vignette tirée de la vidéo.
      imageUri: r.kind === 'story' && r.media_type === 'video' ? '' : r.imageUrl ?? '',
      photoCount: r.media_type === 'video' ? 1 : Math.max(1, r.image_urls?.length ?? 1),
      caption: r.instagram_caption ?? '',
      hashtags: r.hashtags ?? [],
      platforms: pubs.length ? pubs.map((p) => p.platform) : ['instagram', 'facebook'],
      status: r.status,
      createdAt: r.created_at,
      publishedAt: r.published_at,
      publications: pubs,
    });
  }
  return [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
