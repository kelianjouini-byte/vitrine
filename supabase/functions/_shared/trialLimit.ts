/**
 * Limite de l'essai gratuit (choix de Kelian, 25 nov. 2026) : l'IA est payante, donc pendant les 15 jours d'essai
 * Vitrine écrit au plus 3 posts par jour (chacun peut être réécrit 3 fois). Aucune limite pour les clients qui paient.
 * Fichier « pur » (aucune dépendance) : testé avec node --test.
 */
export const TRIAL_POSTS_PER_DAY = 3;
/** 3 posts x (1 texte + 3 « Réécrire ») + quelques petits textes sur les stories. */
export const TRIAL_TEXTS_PER_DAY = 15;

export const TRIAL_LIMIT_MESSAGE = `Pendant l'essai gratuit, Vitrine écrit jusqu'à ${TRIAL_POSTS_PER_DAY} posts par jour. Vous pourrez continuer demain.`;

/**
 * Vrai si cet appel dépasse la limite du jour.
 * `today` : les textes réussis écrits aujourd'hui pour la boutique (post_id null = petit texte de story).
 * `postId` : le post demandé (null pour un petit texte de story).
 */
export function overTrialLimit(today: { post_id: string | null }[], postId: string | null): boolean {
  if (today.length >= TRIAL_TEXTS_PER_DAY) return true;
  if (!postId) return false;
  const posts = new Set(today.map((r) => r.post_id).filter((id): id is string => !!id));
  // Réécrire un post déjà commencé aujourd'hui reste possible.
  return !posts.has(postId) && posts.size >= TRIAL_POSTS_PER_DAY;
}
