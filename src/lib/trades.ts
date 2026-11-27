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
  { id: 'restaurant', label: 'Restaurant', emoji: '🍽️', featured: true, synonyms: ['resto', 'bistrot', 'brasserie', 'cuisine', 'gastronomique', 'bouchon'], aiHint: "Décrire le plat ou l'ambiance, donner envie de réserver une table." },
  { id: 'vetements', label: 'Vêtements', emoji: '👗', featured: true, synonyms: ['boutique de vetements', 'pret a porter', 'mode', 'habillement', 'mode femme', 'mode homme'], aiHint: "Présenter les pièces, les tenues et les conseils de style de la boutique." },
  { id: 'epicerie', label: 'Épicerie fine', emoji: '🧺', featured: true, synonyms: ['epicerie', 'epicier', 'produits du terroir', 'delicatessen', 'produits fins', 'vrac'], aiHint: "Mettre en avant les produits, leur origine, les producteurs et les idées cadeaux gourmandes." },
  { id: 'boucherie', label: 'Boucherie-charcuterie', emoji: '🥩', synonyms: ['boucher', 'bouchere', 'charcutier', 'charcuterie', 'viande', 'volailler', 'halal', 'traiteur boucher'], aiHint: "Parler de la qualité de la viande, de l'origine, des conseils de cuisson et des préparations maison." },
  { id: 'poissonnerie', label: 'Poissonnerie', emoji: '🐟', synonyms: ['poissonnier', 'poisson', 'fruits de mer', 'ecailler', 'huitres'], aiHint: "Mettre en avant la fraîcheur, l'arrivage et des idées de recettes." },
  { id: 'fromagerie', label: 'Fromagerie', emoji: '🧀', synonyms: ['fromager', 'fromagere', 'fromage', 'cremerie', 'cremier'], aiHint: "Présenter les fromages, leur affinage, leur région et les plateaux." },
  { id: 'primeur', label: 'Primeur', emoji: '🍓', synonyms: ['fruits et legumes', 'maraicher', 'marchand de legumes', 'fruits', 'legumes'], aiHint: "Montrer les fruits et légumes de saison, leur fraîcheur et leurs producteurs." },
  { id: 'bar', label: 'Café / bar', emoji: '☕', synonyms: ['cafe', 'bar', 'pub', 'bar a vin', 'bar a bieres'], aiHint: "Parler de l'ambiance, de la terrasse, des moments conviviaux. Rester mesuré sur l'alcool." },
  { id: 'barbier', label: 'Barbier', emoji: '💈', synonyms: ['barber', 'barbershop', 'barbe', 'coiffeur homme'], aiHint: "Montrer les coupes et tailles de barbe, l'ambiance du salon, inviter à prendre rendez-vous." },
  { id: 'bijouterie', label: 'Bijouterie', emoji: '💍', synonyms: ['bijoutier', 'bijoux', 'joaillerie', 'joaillier', 'horlogerie', 'horloger'], aiHint: "Mettre en valeur les bijoux, la finesse du travail et les cadeaux qui marquent." },
  { id: 'opticien', label: 'Opticien', emoji: '👓', synonyms: ['optique', 'lunettes', 'lunetier', 'audioprothesiste', 'audition'], aiHint: "Présenter les montures, le conseil personnalisé et le service. Aucune promesse de santé." },
  { id: 'librairie', label: 'Librairie', emoji: '📚', synonyms: ['libraire', 'livres', 'bd', 'bande dessinee'], aiHint: "Partager un coup de cœur de lecture, une nouveauté, une rencontre. Pas de réduction (prix unique du livre)." },
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
  // Ajoutés le 27 nov. 2026 (demande de Kelian : « plus de métiers »).
  { id: 'glacier', label: 'Glacier', emoji: '🍦', synonyms: ['glace', 'glaces', 'sorbet', 'artisan glacier', 'gelato'], aiHint: "Montrer les parfums, les couleurs et la fraîcheur des glaces artisanales. Donner envie de passer goûter." },
  { id: 'creperie', label: 'Crêperie', emoji: '🥞', synonyms: ['crepe', 'crepes', 'galette', 'galettes', 'creperie bretonne'], aiHint: "Mettre en valeur les crêpes et galettes, la garniture, le côté convivial et fait minute." },
  { id: 'pizzeria', label: 'Pizzeria', emoji: '🍕', synonyms: ['pizza', 'pizzas', 'pizzaiolo', 'pizza a emporter', 'camion pizza'], aiHint: "Montrer la pizza qui sort du four, les bons produits, la pâte maison. Inviter à commander ou à venir." },
  { id: 'snack', label: 'Snack et restauration rapide', emoji: '🥙', synonyms: ['snack', 'kebab', 'burger', 'burgers', 'tacos', 'sandwicherie', 'fast food', 'restauration rapide', 'friterie'], aiHint: "Montrer le plat bien garni, la rapidité et la générosité. Inviter à passer à midi ou à commander." },
  { id: 'asiatique', label: 'Restaurant asiatique', emoji: '🍜', synonyms: ['sushi', 'sushis', 'japonais', 'chinois', 'thai', 'vietnamien', 'ramen', 'wok', 'traiteur asiatique'], aiHint: "Présenter les plats, la fraîcheur et le soin de la préparation. Inviter à réserver ou à emporter." },
  { id: 'foodtruck', label: 'Food truck', emoji: '🚚', synonyms: ['food truck', 'camion', 'camion restaurant', 'cuisine de rue'], aiHint: "Montrer le plat et le camion. Ne jamais inventer l'emplacement ou les horaires : seulement ceux écrits par le commerçant." },
  { id: 'salondethe', label: 'Salon de thé', emoji: '🫖', synonyms: ['salon de the', 'the', 'brunch', 'coffee shop', 'cafe gourmand'], aiHint: "Parler de la pause douceur, des gâteaux, du thé ou du café, de l'ambiance cosy." },
  { id: 'torrefacteur', label: 'Torréfacteur, café et thé', emoji: '🫘', synonyms: ['torrefacteur', 'torrefaction', 'cafe en grains', 'boutique de the', 'maison du the', 'brulerie'], aiHint: "Parler des origines, des arômes, de la torréfaction et du conseil personnalisé." },
  { id: 'bio', label: 'Magasin bio et vrac', emoji: '🌾', synonyms: ['bio', 'magasin bio', 'epicerie bio', 'vrac', 'zero dechet', 'produits locaux'], aiHint: "Mettre en avant les produits, leur origine, les producteurs locaux et la saison. Aucune promesse de santé." },
  { id: 'tabac', label: 'Tabac-presse', emoji: '📰', synonyms: ['tabac', 'buraliste', 'presse', 'maison de la presse', 'journaux', 'loto', 'point relais'], aiHint: "Parler des services (presse, relais colis, cadeaux, jeux). Ne jamais faire la promotion du tabac ou de la cigarette électronique." },
  { id: 'parfumerie', label: 'Parfumerie', emoji: '🌸', synonyms: ['parfum', 'parfums', 'cosmetique', 'cosmetiques', 'maquillage', 'savonnerie'], aiHint: "Présenter les parfums et soins, les coffrets cadeaux et le conseil personnalisé." },
  { id: 'spa', label: 'Spa et massages', emoji: '🧖', synonyms: ['spa', 'massage', 'massages', 'hammam', 'sauna', 'bien etre', 'relaxation'], aiHint: "Parler de détente, de pause pour soi, de l'ambiance apaisante. Inviter à réserver. Aucune promesse de santé." },
  { id: 'pharmacie', label: 'Pharmacie et parapharmacie', emoji: '🩺', synonyms: ['pharmacie', 'pharmacien', 'parapharmacie', 'herboristerie', 'herboriste'], aiHint: "Parler des conseils, de l'équipe, des soins et produits de parapharmacie. Jamais de médicament mis en avant, jamais de promesse de santé ni de promotion." },
  { id: 'fitness', label: 'Salle de sport et coaching', emoji: '🏋️', synonyms: ['salle de sport', 'fitness', 'musculation', 'coach', 'coach sportif', 'crossfit', 'boxe'], aiHint: "Montrer la salle, les cours, l'ambiance et l'équipe. Motiver sans culpabiliser. Aucune promesse de résultat physique." },
  { id: 'yoga', label: 'Yoga, pilates et danse', emoji: '🧘', synonyms: ['yoga', 'pilates', 'danse', 'ecole de danse', 'studio', 'meditation'], aiHint: "Parler des cours, de l'ambiance du studio, du bien-être. Inviter à un cours d'essai si le commerçant le propose." },
  { id: 'lingerie', label: 'Lingerie', emoji: '🩱', synonyms: ['lingerie', 'sous vetements', 'maillots de bain', 'corsetterie'], aiHint: "Présenter les pièces avec élégance et pudeur, le conseil et le confort. Jamais de photo suggestive." },
  { id: 'modeenfant', label: 'Mode enfant', emoji: '👶', synonyms: ['mode enfant', 'vetements enfants', 'bebe', 'naissance', 'liste de naissance'], aiHint: "Présenter les tenues et idées cadeaux de naissance. Ne jamais montrer un enfant sans l'accord des parents." },
  { id: 'friperie', label: 'Friperie et dépôt-vente', emoji: '♻️', synonyms: ['friperie', 'depot vente', 'seconde main', 'vintage', 'occasion'], aiHint: "Montrer les trouvailles du moment, les pièces uniques et le côté seconde main." },
  { id: 'mariage', label: 'Mariage et cérémonie', emoji: '👰', synonyms: ['robe de mariee', 'mariage', 'ceremonie', 'costume', 'boutique de mariage'], aiHint: "Présenter les robes et tenues, le conseil et l'émotion du grand jour. Inviter à prendre rendez-vous." },
  { id: 'mercerie', label: 'Mercerie et loisirs créatifs', emoji: '🧵', synonyms: ['mercerie', 'tissus', 'laine', 'tricot', 'couture', 'loisirs creatifs', 'beaux arts'], aiHint: "Montrer les tissus, les laines, les créations et les ateliers si le commerçant en propose." },
  { id: 'papeterie', label: 'Papeterie', emoji: '✏️', synonyms: ['papeterie', 'fournitures', 'fournitures scolaires', 'carterie', 'stylos'], aiHint: "Présenter les nouveautés, les jolies fournitures, les idées cadeaux." },
  { id: 'disquaire', label: 'Disquaire et musique', emoji: '🎸', synonyms: ['disquaire', 'vinyle', 'vinyles', 'disques', 'instruments de musique', 'guitare', 'luthier'], aiHint: "Partager un coup de cœur, une nouveauté, un instrument. Parler aux passionnés." },
  { id: 'quincaillerie', label: 'Quincaillerie et bricolage', emoji: '🔨', synonyms: ['quincaillerie', 'quincaillier', 'bricolage', 'droguerie', 'outillage', 'outils'], aiHint: "Montrer les produits utiles, le conseil et le dépannage. Parler aux bricoleurs du quartier." },
  { id: 'sport', label: 'Articles de sport et vélos', emoji: '🚲', synonyms: ['magasin de sport', 'articles de sport', 'velo', 'velos', 'cycles', 'randonnee', 'peche', 'surf', 'ski'], aiHint: "Présenter le matériel, le conseil de passionné et l'atelier si le magasin en a un." },
  { id: 'telephonie', label: 'Téléphonie et informatique', emoji: '📱', synonyms: ['telephone', 'telephonie', 'reparation telephone', 'smartphone', 'informatique', 'ordinateur', 'depannage informatique'], aiHint: "Montrer les réparations (avant/après), les accessoires et le service rapide. Ne jamais inventer de délai ou de prix." },
  { id: 'electromenager', label: 'Électroménager et TV', emoji: '📺', synonyms: ['electromenager', 'television', 'hifi', 'image et son', 'multimedia'], aiHint: "Présenter les appareils, la livraison et le service après-vente si le commerçant le propose." },
  { id: 'meubles', label: 'Meubles et literie', emoji: '🛋️', synonyms: ['meubles', 'ameublement', 'literie', 'matelas', 'canape', 'cuisiniste', 'luminaires'], aiHint: "Mettre en scène les meubles dans un intérieur, le confort et le conseil." },
  { id: 'artsdelatable', label: 'Arts de la table et cuisine', emoji: '🍴', synonyms: ['arts de la table', 'vaisselle', 'ustensiles', 'coutellerie', 'liste de mariage'], aiHint: "Présenter une belle table, les ustensiles et les idées cadeaux." },
  { id: 'antiquaire', label: 'Antiquités et brocante', emoji: '🏺', synonyms: ['antiquaire', 'antiquites', 'brocante', 'brocanteur', 'objets anciens'], aiHint: "Raconter l'histoire d'un objet, montrer les trouvailles et les pièces uniques." },
  { id: 'galerie', label: "Galerie d'art et encadrement", emoji: '🖼️', synonyms: ['galerie', 'galerie d art', 'encadrement', 'encadreur', 'artiste', 'peintre'], aiHint: "Présenter une œuvre ou un artiste, le travail d'encadrement, les expositions annoncées par le commerçant." },
  { id: 'photographe', label: 'Photographe', emoji: '📷', synonyms: ['photographe', 'photo', 'studio photo', 'photo d identite'], aiHint: "Montrer les séances, le studio et les tirages. Ne jamais publier une personne sans son accord." },
  { id: 'hotel', label: "Hôtel et chambres d'hôtes", emoji: '🛏️', synonyms: ['hotel', 'chambres d hotes', 'chambre d hote', 'gite', 'camping', 'hebergement'], aiHint: "Montrer les chambres, le petit-déjeuner, la région alentour. Inviter à réserver." },
  { id: 'garage', label: 'Garage automobile', emoji: '🚗', synonyms: ['garage', 'garagiste', 'mecanique', 'carrosserie', 'controle technique', 'pneus', 'lavage auto', 'moto'], aiHint: "Montrer le savoir-faire, l'atelier et le service rendu. Ne jamais inventer de prix ou de délai." },
  { id: 'autoecole', label: 'Auto-école', emoji: '🚦', synonyms: ['auto ecole', 'permis', 'code de la route', 'moto ecole'], aiHint: "Féliciter les élèves (avec leur accord), présenter les moniteurs et les formations." },
  { id: 'immobilier', label: 'Agence immobilière', emoji: '🏠', synonyms: ['agence immobiliere', 'immobilier', 'agent immobilier', 'location', 'gestion locative'], aiHint: "Présenter un bien ou le quartier. Ne jamais inventer de prix, de surface ou de caractéristique." },
  { id: 'batiment', label: 'Artisan du bâtiment', emoji: '🧱', synonyms: ['plombier', 'electricien', 'menuisier', 'peintre en batiment', 'macon', 'chauffagiste', 'carreleur', 'serrurier', 'renovation'], aiHint: "Montrer les chantiers (avant/après), le travail soigné et l'équipe. Ne jamais inventer de prix ou de délai." },
  { id: 'paysagiste', label: 'Paysagiste', emoji: '🌳', synonyms: ['paysagiste', 'jardinier', 'entretien de jardin', 'elagage', 'espaces verts'], aiHint: "Montrer les jardins réalisés (avant/après), la saison et les conseils." },
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

/**
 * Code d'activité officiel (code NAF, ex. « 47.76Z ») → métier du catalogue.
 * Sert à la recherche de la boutique dans l'annuaire des entreprises, à l'inscription.
 * Les codes trop larges (ex. 47.29Z « autres commerces alimentaires ») donnent un métier
 * proche ; le nom de la boutique, s'il est parlant, passe avant (voir guessTrade).
 */
const NAF_TO_TRADE: Record<string, BusinessType> = {
  '10.71A': 'boulangerie', '10.71B': 'boulangerie', '10.71C': 'boulangerie', '47.24Z': 'boulangerie',
  '10.71D': 'patisserie', '10.82Z': 'chocolatier', '10.52Z': 'glacier',
  '10.13B': 'boucherie', '47.22Z': 'boucherie', '47.23Z': 'poissonnerie', '47.21Z': 'primeur',
  '10.51C': 'fromagerie', '47.29Z': 'epicerie', '47.11B': 'epicerie', '47.11C': 'epicerie', '47.11D': 'epicerie',
  '47.25Z': 'caviste', '11.02B': 'caviste', '47.26Z': 'tabac',
  '56.10A': 'restaurant', '56.10B': 'restaurant', '56.10C': 'snack', '56.21Z': 'traiteur', '56.30Z': 'bar',
  '47.76Z': 'fleuriste', '01.19Z': 'jardinerie', '01.30Z': 'jardinerie', '81.30Z': 'paysagiste',
  '96.02A': 'coiffure', '96.02B': 'beaute', '96.04Z': 'spa', '47.75Z': 'parfumerie', '47.73Z': 'pharmacie',
  '47.71Z': 'vetements', '47.72A': 'chaussures', '47.72B': 'chaussures', '47.51Z': 'mercerie',
  '47.77Z': 'bijouterie', '32.12Z': 'bijouterie', '47.78A': 'opticien',
  '47.61Z': 'librairie', '47.62Z': 'papeterie', '47.63Z': 'disquaire', '47.65Z': 'jouets', '47.64Z': 'sport',
  '47.59A': 'meubles', '47.59B': 'artsdelatable', '47.54Z': 'electromenager', '47.43Z': 'electromenager',
  '47.41Z': 'telephonie', '47.42Z': 'telephonie', '95.11Z': 'telephonie', '95.12Z': 'telephonie',
  '47.52A': 'quincaillerie', '47.52B': 'quincaillerie', '47.78C': 'cadeaux', '47.79Z': 'antiquaire',
  '95.23Z': 'cordonnerie', '96.01A': 'pressing', '96.01B': 'pressing', '74.20Z': 'photographe',
  '55.10Z': 'hotel', '55.20Z': 'hotel', '55.30Z': 'hotel', '93.13Z': 'fitness', '85.51Z': 'yoga',
  '85.53Z': 'autoecole', '68.31Z': 'immobilier', '45.11Z': 'garage', '45.20A': 'garage', '45.20B': 'garage', '45.40Z': 'garage',
};

export function tradeFromNaf(naf: string | null | undefined): Trade | undefined {
  if (!naf) return undefined;
  const id = NAF_TO_TRADE[naf.trim().toUpperCase()] ?? (naf.startsWith('43.') ? 'batiment' : undefined);
  return id ? tradeById(id) : undefined;
}

/** Métier deviné à partir du nom de la boutique (« Fromagerie du Marché » → Fromagerie). Mots entiers seulement. */
export function tradeFromName(name: string): Trade | undefined {
  const n = ` ${normalize(name)} `;
  let best: { t: Trade; len: number } | undefined;
  for (const t of TRADES) {
    for (const w of [t.label, ...t.synonyms].map(normalize)) {
      if (w.length >= 4 && n.includes(` ${w} `) && (!best || w.length > best.len)) best = { t, len: w.length };
    }
  }
  return best?.t;
}

/** Le nom parlant passe avant le code officiel, souvent trop large. */
export function guessTrade(names: string[], naf?: string | null): Trade | undefined {
  for (const name of names) {
    const t = tradeFromName(name);
    if (t) return t;
  }
  return tradeFromNaf(naf);
}
