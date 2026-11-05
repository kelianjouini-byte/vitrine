/**
 * Assistant « Je ne sais pas quoi poster » : ce qui marche sans l'IA.
 * Fichier « pur » (aucune dépendance React Native) : testé avec node --test.
 */
import type { PostIdea } from './types';

/** Idées de base, affichées seulement quand l'IA n'est pas branchée (l'écran le dit clairement). */
export function basicIdeas(input: { products?: string; occasion?: { name: string; emoji: string } | null }): PostIdea[] {
  const firstProduct = input.products?.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)[0];
  const ideas: PostIdea[] = [];
  if (input.occasion) {
    ideas.push({
      title: `Préparer ${input.occasion.name}`,
      photo: `Ce que vous proposez pour ${input.occasion.name}, joliment présenté dans la boutique.`,
      why: 'Vos clients commencent à y penser : montrez-leur que vous êtes prêt.',
    });
  }
  ideas.push({
    title: firstProduct ? `À l'honneur : ${firstProduct.toLowerCase()}` : 'Votre produit du moment',
    photo: firstProduct ? `${firstProduct.charAt(0).toUpperCase()}${firstProduct.slice(1)} en gros plan, à la lumière du jour.` : 'Le produit que vous aimez le plus en ce moment, de près, à la lumière du jour.',
    why: 'Un beau produit en gros plan donne envie de passer vous voir.',
  });
  ideas.push({
    title: 'Les coulisses de la boutique',
    photo: 'Vos mains au travail, votre atelier ou la préparation du matin.',
    why: 'Les clients adorent voir le savoir-faire derrière ce qu\'ils achètent.',
  });
  if (ideas.length < 3) {
    ideas.push({
      title: 'Votre vitrine aujourd\'hui',
      photo: 'La devanture ou la vitrine, prise depuis le trottoir.',
      why: 'Les gens du quartier reconnaîtront la boutique en passant devant.',
    });
  }
  return ideas.slice(0, 3);
}

export type IdeaVotes = Record<string, 1 | -1>;

/** Change l'avis sur une idée : un 2e appui sur le même bouton retire l'avis. */
export function toggleVote(votes: IdeaVotes, title: string, vote: 1 | -1): IdeaVotes {
  const next = { ...votes };
  if (next[title] === vote) delete next[title];
  else next[title] = vote;
  // On garde seulement les 100 derniers avis sur le téléphone.
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - 100))) delete next[k];
  return next;
}
