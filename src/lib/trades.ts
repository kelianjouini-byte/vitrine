/**
 * Catalogue des métiers visés par Vitrine.
 * Fichier « pur » (aucune dépendance React Native) : testé et réutilisable côté serveur.
 */
import type { BusinessType } from './types';

export interface Trade {
  id: BusinessType;
  label: string;
  emoji: string;
  /** Mots que le commerçant peut taper pour trouver ce métier. */
  synonyms: string[];
  /** Montré d'office sous la barre de recherche. */
  featured?: boolean;
  /** Consigne pour l'IA : ce qu'un post de ce métier met en valeur. */
  aiHint: string;
}

export const TRADES: Trade[] = [
  { id: 'fleuriste', label: 'Fleuriste', emoji: '💐', featured: true, synonyms: ['fleur', 'fleurs', 'bouquet', 'composition florale', 'artisan fleuriste'], aiHint: "Mettre en valeur les fleurs, les couleurs, la fraîcheur et le savoir-faire des compositions." },
  { id: 'boulangerie', label: 'Boulangerie', emoji: '🥖', featured: true, synonyms: ['boulanger', 'boulangere', 'pain', 'baguette', 'viennoiserie'], aiHint: "Parler du pain du jour, des viennoiseries, du fait-maison et de l'odeur du four." },
  { id: 'patisserie', label: 'Pâtisserie', emoji: '🍰', featured: true, synonyms: ['patissier', 'patissiere', 'gateau', 'gateaux', 'dessert'], aiHint: "Mettre en valeur la gourmandise, la finesse des créations et les gâteaux sur commande." },
  { id: 'chocolatier', label: 'Chocolatier', emoji: '🍫', featured: true, synonyms: ['chocolat', 'chocolaterie', 'confiserie', 'confiseur', 'bonbons'], aiHint: "Parler du chocolat, des créations de saison et des idées cadeaux gourmandes." },
  { id: 'caviste', label: 'Caviste', emoji: '🍷', featured: true, synonyms: ['vin', 'vins', 'cave', 'cave a vin', 'spiritueux', 'biere', 'champagne'], aiHint: "Présenter les bouteilles, les accords mets-vins et les conseils du caviste. Rester mesuré sur l'alcool." },
  { id: 'coiffure', label: 'Coiffure', emoji: '💇', featured: true, synonyms: ['coiffeur', 'coiffeuse', 'salon de coiffure', 'cheveux', 'coupe', 'coloration'], aiHint: "Montrer les coupes, couleurs et l'ambiance du salon. Inviter à prendre rendez-vous." },
  { id: 'beaute', label: 'Institut de beauté', emoji: '💆', featured: true, synonyms: ['esthetique', 'estheticienne', 'soins', 'spa', 'institut', 'beaute', 'massage'], aiHint: "Parler bien-être, soins, détente, et inviter à réserver un moment pour soi." },
  { id: 'restaurant', label: 'Restaurant', emoji: '🍽️', featured: true, synonyms: ['resto', 'bistrot', 'brasserie', 'pizzeria', 'creperie', 'cuisine'], aiHint: "Décrire le plat ou l'ambiance, donner envie de réserver une table." },
  { id: 'vetements', label: 'Vêtements', emoji: '👗', featured: true, synonyms: ['boutique de vetements', 'pret a porter', 'mode', 'habillement', 'friperie'], aiHint: "Présenter les pièces, les tenues et les conseils de style de la boutique." },
  { id: 'epicerie', label: 'Épicerie fine', emoji: '🧺', featured: true, synonyms: ['epicerie', 'epicier', 'produits du terroir', 'delicatessen', 'produits fins', 'vrac'], aiHint: "Mettre en avant les produits, leur origine, les producteurs et les idées cadeaux gourmandes." },
  { id: 'boucherie', label: 'Boucherie-charcuterie', emoji: '🥩', synonyms: ['boucher', 'bouchere', 'charcutier', 'charcuterie', 'viande', 'volailler'], aiHint: "Parler de la qualité de la viande, de l'origine, des conseils de cuisson et des préparations maison." },
  { id: 'poissonnerie', label: 'Poissonnerie', emoji: '🐟', synonyms: ['poissonnier', 'poisson', 'fruits de mer', 'ecailler', 'huitres'], aiHint: "Mettre en avant la fraîcheur, l'arrivage et des idées de recettes." },
  { id: 'fromagerie', label: 'Fromagerie', emoji: '🧀', synonyms: ['fromager', 'fromagere', 'fromage', 'cremerie', 'cremier'], aiHint: "Présenter les fromages, leur affinage, leur région et les plateaux." },
  { id: 'primeur', label: 'Primeur', emoji: '🍓', synonyms: ['fruits et legumes', 'maraicher', 'marchand de legumes', 'fruits', 'legumes'], aiHint: "Montrer les fruits et légumes de saison, leur fraîcheur et leurs producteurs." },
  { id: 'bar', label: 'Café / bar', emoji: '☕', synonyms: ['cafe', 'bar', 'pub', 'brasserie', 'salon de the', 'tabac'], aiHint: "Parler de l'ambiance, de la terrasse, des moments conviviaux. Rester mesuré sur l'alcool." },
  { id: 'barbier', label: 'Barbier', emoji: '💈', synonyms: ['barber', 'barbershop', 'barbe', 'coiffeur homme'], aiHint: "Montrer les coupes et tailles de barbe, l'ambiance du salon, inviter à prendre rendez-vous." },
  { id: 'bijouterie', label: 'Bijouterie', emoji: '💍', synonyms: ['bijoutier', 'bijoux', 'joaillerie', 'joaillier', 'horlogerie', 'horloger'], aiHint: "Mettre en valeur les bijoux, la finesse du travail et les cadeaux qui marquent." },
  { id: 'opticien', label: 'Opticien', emoji: '👓', synonyms: ['optique', 'lunettes', 'lunetier', 'audioprothesiste'], aiHint: "Présenter les montures, le conseil personnalisé et le service. Aucune promesse de santé." },
  { id: 'librairie', label: 'Librairie', emoji: '📚', synonyms: ['libraire', 'livres', 'bd', 'bande dessinee', 'papeterie'], aiHint: "Partager un coup de cœur de lecture, une nouveauté, une rencontre. Pas de réduction (prix unique du livre)." },
  { id: 'cadeaux', label: 'Boutique cadeaux et déco', emoji: '🎁', synonyms: ['cadeau', 'deco', 'decoration', 'concept store', 'objets', 'maison'], aiHint: "Présenter les objets, les idées cadeaux et l'univers de la boutique." },
  { id: 'jouets', label: 'Magasin de jouets', emoji: '🧸', synonyms: ['jouet', 'jeux', 'jeux de societe', 'puericulture', 'enfants'], aiHint: "Montrer les jouets et les jeux, parler aux parents et aux grands-parents." },
  { id: 'chaussures', label: 'Chaussures et maroquinerie', emoji: '👞', synonyms: ['chausseur', 'chaussure', 'maroquinerie', 'sacs', 'maroquinier'], aiHint: "Présenter les modèles, le confort, la qualité des matières." },
  { id: 'toilettage', label: 'Toilettage et animalerie', emoji: '🐾', synonyms: ['toiletteur', 'toiletteuse', 'animalerie', 'chien', 'chat', 'animaux'], aiHint: "Montrer les animaux chouchoutés (avec l'accord des maîtres) et les soins proposés." },
  { id: 'jardinerie', label: 'Jardinerie et pépinière', emoji: '🌱', synonyms: ['jardinerie', 'pepiniere', 'pepinieriste', 'plantes', 'horticulteur', 'jardin'], aiHint: "Parler des plantes du moment, des conseils de jardinage et de la saison." },
  { id: 'onglerie', label: 'Onglerie', emoji: '💅', synonyms: ['ongles', 'prothesiste ongulaire', 'nail', 'manucure', 'pose de vernis'], aiHint: "Montrer les poses et les décors d'ongles, inviter à réserver." },
  { id: 'tatoueur', label: 'Tatoueur', emoji: '🖋️', synonyms: ['tatouage', 'tattoo', 'salon de tatouage', 'piercing', 'pierceur'], aiHint: "Montrer les réalisations ou l'univers du salon (hygiène, ambiance, artistes). Si la photo montre le salon, présenter le lieu et inviter à prendre rendez-vous pour un projet." },
  { id: 'cordonnerie', label: 'Cordonnerie et clés', emoji: '🔑', synonyms: ['cordonnier', 'cles', 'reproduction de cles', 'reparation chaussures'], aiHint: "Montrer le savoir-faire de réparation, avant/après, et le service rendu." },
  { id: 'pressing', label: 'Pressing et retouches', emoji: '👔', synonyms: ['pressing', 'blanchisserie', 'retouche', 'retouches', 'couturiere', 'laverie'], aiHint: "Parler du soin des vêtements, des retouches et du service." },
  { id: 'artisan', label: 'Artisan créateur', emoji: '🛠️', synonyms: ['artisan', 'createur', 'ceramique', 'ceramiste', 'bougies', 'ebeniste', 'atelier', 'fait main'], aiHint: "Montrer le geste, l'atelier, la pièce unique et le fait-main." },
  { id: 'traiteur', label: 'Traiteur', emoji: '🥘', synonyms: ['traiteur', 'plats a emporter', 'buffet', 'reception'], aiHint: "Présenter les plats, les buffets et les commandes pour les fêtes et événements." },
];

/** Enlève accents, majuscules et ponctuation pour comparer des mots. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function tradeById(id: BusinessType): Trade | undefined {
  return TRADES.find((t) => t.id === id);
}

/** Recherche pour la barre de l'inscription : les meilleurs résultats d'abord. */
export function searchTrades(query: string, limit = 6): Trade[] {
  const q = normalize(query);
  if (!q) return TRADES.filter((t) => t.featured);
  const scored = TRADES.map((t) => {
    const words = [t.label, ...t.synonyms].map(normalize);
    let score = 0;
    for (const w of words) {
      if (w === q) score = Math.max(score, 3);
      else if (w.startsWith(q) || w.split(' ').some((p) => p.startsWith(q))) score = Math.max(score, 2);
      else if (q.length >= 3 && (w.includes(q) || q.includes(w))) score = Math.max(score, 1);
    }
    return { t, score };
  }).filter((x) => x.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.t);
}

/** Trouve le métier du catalogue qui correspond à un texte libre (ex. réponse de l'IA). */
export function matchTrade(text: string): Trade | undefined {
  const q = normalize(text);
  if (!q) return undefined;
  const exact = TRADES.find((t) => [t.label, ...t.synonyms].some((w) => normalize(w) === q));
  if (exact) return exact;
  return TRADES.find((t) => [t.label, ...t.synonyms].some((w) => {
    const n = normalize(w);
    return n.length >= 4 && (q.includes(n) || n.includes(q));
  }));
}
