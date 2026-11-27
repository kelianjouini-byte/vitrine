// « Le petit rappel du jour » : un message différent chaque jour pour donner envie de publier.
// Envoyé seulement les jours d'ouverture, à l'heure choisie (10 h par défaut, la boutique est
// ouverte à cette heure-là presque partout), et jamais si le commerçant a déjà publié dans la journée.
// Fichier pur (aucune dépendance Deno ni React Native) : utilisé par la fonction daily-nudge,
// par l'appli (aperçu dans Réglages) et testé avec node --test.

export interface Nudge {
  /** Identifiant stable du texte (pour ne pas renvoyer le même trop souvent). */
  id: string;
  title: string;
  body: string;
}

export interface NudgeContext {
  firstName?: string | null;
  businessName: string;
  businessType: string;
  city?: string | null;
  /** Jours depuis la dernière publication (null = jamais publié). */
  daysSincePost: number | null;
  /** Prochaine occasion du métier (fête, jour férié ouvert...), dans les 10 jours. */
  occasion?: { name: string; inDays: number } | null;
  /** 0 = lundi ... 6 = dimanche (heure de Paris). */
  weekday: number;
  /** Graine du jour (ex. id de l'abonnement + date) : le choix est stable pour un même jour. */
  seed: string;
  /** Textes envoyés récemment, à éviter. */
  recent?: string[];
}

type Raw = [id: string, title: string, body: string];

// ------------------------------------------------------------------ Textes
// Règles : vouvoiement, ton d'un community manager bienveillant, jamais culpabilisant,
// jamais de chiffre inventé, pas d'emoji. {boutique}, {ville}, {prenom} sont remplacés.

/** Le cœur des rappels : courts, clairs, en une seconde on comprend « il faut poster aujourd'hui ».
 *  Ils peuvent revenir souvent, c'est voulu (choix de Kelian, 27 nov. 2026). */
const SHORT: Raw[] = [
  ['s-postez', 'Postez aujourd\'hui', 'Une photo, et Vitrine s\'occupe du reste.'],
  ['s-petit-post', 'Un petit post ?', 'Une photo suffit. Vitrine écrit le texte pour vous.'],
  ['s-petite-story', 'Une petite story ?', 'Quelques secondes, et vos clients voient votre journée.'],
  ['s-petit-reel', 'Un petit Reel ?', 'Filmez quelques secondes, Vitrine fait le montage.'],
  ['s-petite-video', 'Une petite vidéo ?', 'Quelques secondes de votre boutique, et c\'est en ligne.'],
  ['s-une-photo', 'Une photo, et c\'est tout', 'Vitrine écrit le texte et publie sur Instagram et Facebook.'],
  ['s-moment', 'C\'est le moment de poster', 'Vos clients regardent leur téléphone. Montrez-leur votre boutique.'],
  ['s-on-poste', 'On poste aujourd\'hui ?', 'Une photo prise en passant, ça suffit largement.'],
  ['s-2-minutes', 'Deux minutes pour poster ?', 'Une photo, vous validez, c\'est publié.'],
  ['s-montrez', 'Montrez votre boutique', 'Une photo aujourd\'hui, et vos clients pensent à vous.'],
  ['s-pensez', 'Pensez à poster', 'Poster souvent, c\'est ce qui fait venir les clients.'],
  ['s-rappel', 'Petit rappel : postez', 'Une photo ou une vidéo, Vitrine fait le reste.'],
  ['s-story-jour', 'La story du jour', 'Montrez ce qui se passe chez vous en ce moment.'],
  ['s-post-jour', 'Le post du jour', 'Qu\'allez-vous montrer aujourd\'hui ? Une photo suffit.'],
  ['s-reel-jour', 'Le Reel du jour', 'Une petite vidéo, et vous touchez plus de monde.'],
  ['s-attendent', 'Vos clients vous attendent', 'Un petit post aujourd\'hui pour leur donner de vos nouvelles.'],
  ['s-oubliez-pas', 'N\'oubliez pas de poster', 'Une photo, et votre page reste vivante.'],
  ['s-un-clic', 'Une photo, un clic', 'Vitrine écrit, vous validez, c\'est en ligne.'],
  ['s-allez', 'Allez, une petite photo', 'Ça prend une minute, et ça fait venir du monde.'],
  ['s-instagram', 'Instagram vous attend', 'Un petit post aujourd\'hui ? Vitrine écrit le texte.'],
  ['s-deux-pages', 'Instagram et Facebook en un geste', 'Une photo, et vos deux pages sont à jour.'],
  ['s-visible', 'Restez visible aujourd\'hui', 'Un post ou une story, c\'est ce qui compte.'],
  ['s-chaque-jour', 'Postez un peu chaque jour', 'Ceux qui postent souvent sont ceux qu\'on voit.'],
  ['s-quoi-neuf', 'Quoi de neuf aujourd\'hui ?', 'Montrez-le en photo, Vitrine s\'occupe du texte.'],
  ['s-photo-vite', 'Une photo vite fait ?', 'Pas besoin qu\'elle soit parfaite. Vitrine fait le reste.'],
  ['s-story-vite', 'Une story vite fait ?', 'Ce que vous voyez maintenant, vos clients aimeront le voir.'],
  ['s-video-vite', 'Une vidéo vite fait ?', 'Quelques secondes suffisent pour un beau Reel.'],
  ['s-ca-marche', 'Poster, ça marche', 'Plus vous postez, plus on vous voit. Une photo aujourd\'hui ?'],
  ['s-a-vous', 'À vous de jouer', 'Une photo ou une vidéo, et Vitrine publie pour vous.'],
  ['s-faites-vivre', 'Faites vivre votre page', 'Un petit post aujourd\'hui, c\'est tout ce qu\'il faut.'],
  ['s-1-minute', 'Une minute, un post', 'Prenez une photo, Vitrine écrit le reste.'],
  ['s-hop', 'Hop, une photo !', 'Et votre post est prêt en quelques secondes.'],
  ['s-boutique-jour', '{boutique} aujourd\'hui', 'Montrez votre journée en une photo ou une story.'],
  ['s-etes-la', 'Montrez que vous êtes là', 'Un post aujourd\'hui, et vos clients pensent à passer.'],
  ['s-vitrine-attend', 'Vitrine attend votre photo', 'Le texte, les hashtags, la publication : on s\'occupe de tout.'],
  ['s-ce-matin', 'Une photo de ce matin ?', 'Ce que vous avez préparé mérite d\'être vu.'],
  ['s-telephone', 'Vos clients sont sur leur téléphone', 'Soyez dans leur fil aujourd\'hui avec un petit post.'],
  ['s-pas-le-temps', 'Pas le temps ? Une photo suffit', 'Vitrine écrit le texte et publie à votre place.'],
  ['s-story-ou-post', 'Story ou post ?', 'Les deux marchent. L\'important, c\'est de poster aujourd\'hui.'],
  ['s-reel-ou-story', 'Reel ou story ?', 'Choisissez, Vitrine s\'occupe du reste.'],
  ['s-nouveaux', 'De nouveaux clients ?', 'Ils vous trouvent quand vous postez. Une photo aujourd\'hui ?'],
  ['s-prenez', 'Prenez votre téléphone', 'Une photo de la boutique, et c\'est parti.'],
  ['s-habitude', 'Un post par jour', 'C\'est la meilleure habitude pour faire venir du monde.'],
  ['s-et-si', 'Et si on postait ?', 'Une petite photo, une petite vidéo : vous choisissez.'],
  ['s-travail', 'Montrez votre travail', 'Vos clients adorent voir ce que vous faites. Postez-le.'],
  ['s-aujourdhui', 'Aujourd\'hui, on poste', 'Une photo, une story ou un Reel : Vitrine vous aide.'],
  ['s-bonjour-clients', 'Dites bonjour à vos clients', 'Une petite story suffit pour leur montrer votre journée.'],
  ['s-petit-geste', 'Un petit geste pour votre boutique', 'Une photo aujourd\'hui, et on parle de vous.'],
  ['s-ca-prend', 'Ça prend une minute', 'Une photo, Vitrine écrit, vous validez. C\'est posté.'],
  ['s-fil', 'Soyez dans le fil de vos clients', 'Un post ou une story aujourd\'hui, et ils vous voient.'],
];

const GENERAL: Raw[] = [
  ['g-photo-jour', 'Une photo aujourd\'hui ?', 'Vos clients aiment voir ce qui se passe chez vous. Une photo, et Vitrine écrit le reste.'],
  ['g-coulisses', 'Montrez les coulisses', 'Un produit, un geste, un coin de la boutique : vos abonnés adorent voir l\'envers du décor.'],
  ['g-dans-la-tete', 'Restez dans leur tête', 'Une publication aujourd\'hui, c\'est {boutique} qui reste en mémoire. Ça prend une minute.'],
  ['g-fierte', 'De quoi êtes-vous fier ce matin ?', 'Prenez-le en photo. Vitrine s\'occupe du texte et des hashtags.'],
  ['g-une-minute', 'Une minute pour {boutique}', 'Une photo suffit : Vitrine écrit le texte, ajoute les hashtags {de_ville} et publie.'],
  ['g-regularite', 'Être vu, c\'est être régulier', 'Instagram montre davantage les boutiques qui publient souvent. Une photo aujourd\'hui ?'],
  ['g-decouvrir', 'Faites-vous découvrir', 'Des gens {de_ville} cherchent une adresse comme la vôtre. Montrez-leur ce que vous faites.'],
  ['g-vitrine', 'Votre vitrine, aussi sur Instagram', 'Ce que vous avez mis en place ce matin mérite d\'être vu au-delà de votre rue.'],
  ['g-metier', 'Racontez votre métier', 'Un geste que vous faites tous les jours peut étonner vos clients. Montrez-le.'],
  ['g-quelque-chose', 'Il y a toujours quelque chose à montrer', 'Une nouveauté, un client fidèle, un détail de la boutique : Vitrine vous aide à le dire.'],
  ['g-deux-reseaux', 'Instagram et Facebook en une fois', 'Une seule photo, et vos deux pages sont à jour. Vous gardez la main avant chaque envoi.'],
  ['g-fil', 'Restez dans le fil de vos clients', 'Une boutique qui publie régulièrement reste dans leur fil d\'actualité, et dans leur tête.'],
  ['g-pas-parfaite', 'Pas besoin d\'une photo parfaite', 'Une photo simple et vraie plaît souvent plus qu\'une belle image de catalogue.'],
  ['g-story', 'Et si vous faisiez une story ?', 'Une story reste 24 heures : parfait pour montrer l\'instant, sans se prendre la tête.'],
  ['g-video', 'Dix secondes de vidéo ?', 'Filmez un geste de votre travail : Vitrine en fait un Reel, avec le texte dessus.'],
  ['g-sourire', 'Un visage, ça rassure', 'Une photo de vous ou de l\'équipe au travail donne envie de pousser la porte.'],
  ['g-conseil', 'Partagez un conseil', 'Vous donnez des conseils toute la journée. Une photo, et ce conseil profite à tous vos abonnés.'],
  ['g-nouveaute', 'Quoi de neuf chez vous ?', 'Un arrivage, un produit remis en rayon, une petite nouveauté : c\'est le moment de le dire.'],
  ['g-bonjour', 'Bonjour {prenom}', 'Vos clients aimeraient avoir de vos nouvelles. Une photo aujourd\'hui, et Vitrine fait le reste.'],
  ['g-habitues', 'Vos habitués vous suivent', 'Ils aiment voir ce qui se prépare chez vous. Une photo leur donne une raison de passer.'],
  ['g-lumiere', 'Profitez de la belle lumière', 'Une photo près de la vitrine, à la lumière du jour : c\'est souvent la plus réussie.'],
  ['g-produit-star', 'Votre produit vedette', 'Celui que vos clients vous demandent le plus : il mérite sa photo aujourd\'hui.'],
];

/** Textes par famille de métier. */
const TRADES: Record<string, Raw[]> = {
  fleurs: [
    ['t-fleurs-bouquet', 'Un bouquet à montrer ?', 'Celui que vous venez de terminer ferait une très belle photo.'],
    ['t-fleurs-arrivage', 'Les fleurs du jour', 'Montrez ce qui vient d\'arriver : vos clients aiment savoir ce qu\'il y a de frais.'],
    ['t-fleurs-geste', 'Vos mains au travail', 'Quelques secondes de vidéo pendant que vous composez un bouquet : c\'est un très beau Reel.'],
  ],
  boulangerie: [
    ['t-pain-four', 'Ça sort du four ?', 'Le pain ou les viennoiseries tout juste sortis, c\'est la photo que vos clients préfèrent.'],
    ['t-pain-comptoir', 'Votre comptoir du jour', 'Un comptoir bien garni donne envie de passer. Une photo et c\'est en ligne.'],
    ['t-pain-gateau', 'Le gâteau du moment', 'Votre création du jour mérite d\'être vue avant d\'être mangée.'],
  ],
  beaute: [
    ['t-beaute-resultat', 'Un beau résultat aujourd\'hui ?', 'Avec l\'accord de votre client, une photo du résultat fait toujours son effet.'],
    ['t-beaute-salon', 'Montrez votre salon', 'Vos futurs clients aiment voir où ils vont s\'installer. Une photo du lieu suffit.'],
    ['t-beaute-produit', 'Le produit que vous conseillez', 'Celui que vous recommandez le plus : montrez-le, avec un mot pour dire pourquoi.'],
  ],
  cave: [
    ['t-cave-bouteille', 'La bouteille du moment', 'Celle que vous aimez conseiller : montrez-la, avec ce qui l\'accompagne bien.'],
    ['t-cave-coup-coeur', 'Votre coup de cœur', 'Vos clients adorent les conseils du patron. Une photo, et Vitrine écrit le reste.'],
    ['t-cave-arrivage', 'Un nouvel arrivage ?', 'Ce qui vient d\'arriver en rayon donne une bonne raison de passer vous voir.'],
  ],
  etal: [
    ['t-etal-matin', 'Votre étal ce matin', 'Un étal bien garni donne envie. Une photo, et vos clients savent quoi venir chercher.'],
    ['t-etal-produit', 'Le produit de saison', 'Montrez ce qui est bon en ce moment : vos clients aiment les conseils de saison.'],
    ['t-etal-savoir-faire', 'Votre savoir-faire', 'Un geste de métier filmé quelques secondes : c\'est ce qui vous rend unique.'],
  ],
  restaurant: [
    ['t-resto-plat', 'Le plat du jour', 'Une photo de l\'assiette avant le service, et vos clients savent où manger.'],
    ['t-resto-cuisine', 'Ça se passe en cuisine', 'Quelques secondes de vidéo en cuisine : vos clients adorent voir la préparation.'],
    ['t-resto-salle', 'Votre salle vous attend', 'Une photo de la salle prête pour le service donne envie de réserver.'],
  ],
  mode: [
    ['t-mode-nouveaute', 'La nouveauté en rayon', 'Une pièce qui vient d\'arriver, portée ou posée : elle mérite une photo.'],
    ['t-mode-tenue', 'Une idée de tenue', 'Associez deux ou trois pièces et prenez-les en photo : vos clientes adorent les idées.'],
    ['t-mode-vitrine', 'Votre vitrine du moment', 'Vous l\'avez soignée, montrez-la à ceux qui ne passent pas devant.'],
  ],
  artisan: [
    ['t-artisan-avant-apres', 'Avant, après', 'Un travail que vous venez de finir : montrez-le, c\'est la meilleure des publicités.'],
    ['t-artisan-chantier', 'Un travail en cours ?', 'Une photo du travail en cours montre votre savoir-faire mieux qu\'un long discours.'],
    ['t-artisan-outil', 'Les gestes du métier', 'Filmez quelques secondes de votre travail : vos clients voient le soin que vous y mettez.'],
  ],
};

const FAMILY: Record<string, keyof typeof TRADES> = {
  fleuriste: 'fleurs', jardinerie: 'fleurs', paysagiste: 'artisan',
  boulangerie: 'boulangerie', patisserie: 'boulangerie', chocolatier: 'boulangerie', glacier: 'boulangerie', salondethe: 'boulangerie',
  coiffure: 'beaute', barbier: 'beaute', beaute: 'beaute', onglerie: 'beaute', spa: 'beaute', parfumerie: 'beaute', tatoueur: 'beaute', toilettage: 'beaute',
  caviste: 'cave', bar: 'cave', fromagerie: 'cave', epicerie: 'cave', torrefacteur: 'cave', bio: 'cave',
  boucherie: 'etal', poissonnerie: 'etal', primeur: 'etal', traiteur: 'etal',
  restaurant: 'restaurant', pizzeria: 'restaurant', creperie: 'restaurant', snack: 'restaurant', asiatique: 'restaurant', foodtruck: 'restaurant', hotel: 'restaurant',
  vetements: 'mode', chaussures: 'mode', lingerie: 'mode', modeenfant: 'mode', friperie: 'mode', bijouterie: 'mode', mariage: 'mode', opticien: 'mode',
  artisan: 'artisan', cordonnerie: 'artisan', batiment: 'artisan', garage: 'artisan', meubles: 'artisan', antiquaire: 'artisan', mercerie: 'artisan',
};

const WEEKDAYS: Record<number, Raw[]> = {
  0: [['w-lundi', 'Bien commencer la semaine', 'Une photo ce lundi pour rappeler à vos clients que vous êtes là.']],
  2: [['w-mercredi', 'Milieu de semaine', 'Un petit rappel à vos clients que vous êtes là : une photo, et c\'est fait.']],
  4: [['w-vendredi', 'Avant le week-end', 'Vos clients préparent leur week-end. Montrez-leur pourquoi passer chez vous.']],
  5: [['w-samedi', 'Samedi, jour de passage', 'Il y a du monde aujourd\'hui : une story montre l\'ambiance de la boutique.']],
  6: [['w-dimanche', 'Ouvert ce dimanche', 'Peu de boutiques sont ouvertes : dites-le avec une photo, ça peut faire venir du monde.']],
};

/** Quand le commerçant n'a pas publié depuis un moment : doux, jamais culpabilisant. */
const GAP_NEVER: Raw[] = [
  ['p-premier', 'Votre première publication', 'Prenez une photo de votre boutique : Vitrine écrit le texte, vous n\'avez qu\'à valider.'],
  ['p-premier-2', 'On commence ensemble ?', 'Une photo de ce que vous préférez vendre, et votre première publication est prête.'],
];
const GAP_FEW: Raw[] = [
  ['p-nouvelles', 'Vos clients attendent de vos nouvelles', 'Votre dernière publication date de {jours} jours. Une photo aujourd\'hui, et vous revoilà dans leur fil.'],
  ['p-relance', 'Une petite photo aujourd\'hui ?', 'Cela fait {jours} jours depuis votre dernière publication. Une minute suffit pour reprendre le fil.'],
];
const GAP_LONG: Raw[] = [
  ['p-douceur', 'On reprend en douceur ?', 'Ça arrive à tout le monde. Une seule photo aujourd\'hui, et c\'est reparti.'],
  ['p-revenir', 'Revenez dans le fil de vos clients', 'Une photo simple suffit pour que vos abonnés pensent à nouveau à vous.'],
];

function occasionTexts(name: string, inDays: number): Raw[] {
  if (inDays <= 0) return [['o-jour', `C'est ${name} aujourd'hui`, 'Montrez à vos clients que vous êtes prêts. Une photo suffit.']];
  if (inDays === 1) return [['o-demain', `${name}, c'est demain`, 'Dernière occasion d\'en parler à vos clients. Une photo de ce que vous préparez ?']];
  return [
    ['o-bientot', `${name} dans ${inDays} jours`, 'C\'est le bon moment pour en parler. Une photo de ce que vous préparez, Vitrine écrit le reste.'],
    ['o-preparez', `Vous préparez ${name} ?`, `Plus que ${inDays} jours : montrez à vos clients ce qui les attend chez vous.`],
  ];
}

// ------------------------------------------------------------------ Choix

/** Petit hachage stable (FNV-1a) pour choisir « au hasard » mais toujours pareil pour une même graine. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function fill(r: Raw, c: NudgeContext, days?: number): Nudge {
  const name = c.businessName.trim() || 'votre boutique';
  const city = c.city?.trim() || 'votre ville';
  const deVille = c.city?.trim() ? (/^[aeiouyàâéèêîôûh]/i.test(city) ? `d'${city}` : `de ${city}`) : 'de votre ville';
  const sub = (s: string) => s.replace(/\{de_ville\}/g, deVille).replace(/\{boutique\}/g, name).replace(/\{ville\}/g, city).replace(/\{prenom\}/g, c.firstName?.trim() || '').replace(/\{jours\}/g, String(days ?? ''));
  return { id: r[0], title: sub(r[1]).replace(/\s+$/, ''), body: sub(r[2]) };
}

function pick(list: Raw[], c: NudgeContext, salt: string): Raw {
  const recent = new Set(c.recent ?? []);
  const fresh = list.filter((r) => !recent.has(r[0]));
  const from = fresh.length ? fresh : list;
  return from[hash(c.seed + salt) % from.length];
}

/** Les textes plus longs (conseils, idées, métier, jour de la semaine) qui varient les rappels courts. */
export function nudgePool(c: Pick<NudgeContext, 'businessType' | 'weekday' | 'firstName'>): Raw[] {
  const family = FAMILY[c.businessType];
  const trade = family ? TRADES[family] : [];
  const general = c.firstName?.trim() ? GENERAL : GENERAL.filter((r) => !r[1].includes('{prenom}'));
  return [...general, ...trade, ...(WEEKDAYS[c.weekday] ?? [])];
}

/** Le texte du jour. Priorités : une fête toute proche, un long silence ; sinon surtout un rappel court
 *  (« Postez aujourd'hui », « Une petite story ? »), parfois une idée ou un texte du métier. */
export function pickNudge(c: NudgeContext): Nudge {
  const roll = hash(c.seed + ':roll') % 100;
  const occ = c.occasion;
  if (occ && occ.inDays >= 0 && occ.inDays <= 10 && (occ.inDays <= 2 || roll < 40)) {
    return fill(pick(occasionTexts(occ.name, occ.inDays), c, ':occ'), c);
  }
  const d = c.daysSincePost;
  if (d === null && roll < 60) return fill(pick(GAP_NEVER, c, ':never'), c);
  if (d !== null && d >= 7 && roll < 50) return fill(pick(GAP_LONG, c, ':long'), c, d);
  if (d !== null && d >= 3 && roll < 30) return fill(pick(GAP_FEW, c, ':few'), c, d);
  if (hash(c.seed + ':kind') % 100 < 70) return fill(pick(SHORT, c, ':short'), c);
  return fill(pick(nudgePool(c), c, ':pool'), c);
}

/** Nombre total de textes différents (affiché à Kelian, vérifié par les tests). */
export function nudgeCount(): number {
  return SHORT.length + GENERAL.length + Object.values(TRADES).reduce((n, l) => n + l.length, 0) + Object.values(WEEKDAYS).reduce((n, l) => n + l.length, 0)
    + GAP_NEVER.length + GAP_FEW.length + GAP_LONG.length + 4;
}

// ------------------------------------------------------------------ Quand envoyer

export interface ShopHours {
  /** Heure choisie pour le rappel (heure de Paris). */
  hour: number;
  /** Jours de fermeture (0 = lundi ... 6 = dimanche). */
  closedDays: number[];
  /** Jours fermés exceptionnels (« 2026-12-25 »), par ex. un jour férié. */
  closedDates?: string[];
}

/** 10 h : presque toutes les boutiques sont ouvertes, et le rush du matin est passé. */
export const DEFAULT_NUDGE_HOUR = 10;
/** Heures proposées dans Réglages. */
export const NUDGE_HOURS = [9, 10, 11, 12, 14, 16, 18] as const;

/** Date, jour de la semaine (0 = lundi) et heure à Paris. */
export function parisNow(now: Date): { day: string; weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'));
  return { day: `${get('year')}-${get('month')}-${get('day')}`, weekday, hour: Number(get('hour')) };
}

/** Début de la journée à Paris, en heure universelle (pour chercher les posts du jour). */
export function parisDayStart(now: Date): Date {
  const { day, hour } = parisNow(now);
  const guess = new Date(`${day}T00:00:00Z`);
  // Décalage Paris = heure de Paris - heure universelle (1 h en hiver, 2 h en été).
  const offset = (hour - now.getUTCHours() + 24) % 24;
  return new Date(guess.getTime() - offset * 3_600_000);
}

export type NudgeSkip = 'closed_day' | 'not_yet' | 'too_late' | 'already_sent' | 'already_posted';

/** Faut-il envoyer le rappel maintenant ? Le cron passe toutes les heures : on envoie à l'heure choisie,
 *  ou l'heure d'après si un passage a été manqué. Jamais plus tard (la boutique a peut-être fermé). */
export function nudgeDue(h: ShopHours, now: Date, state: { sentToday: boolean; postedToday: boolean }): true | NudgeSkip {
  const p = parisNow(now);
  if (h.closedDays.includes(p.weekday) || (h.closedDates ?? []).includes(p.day)) return 'closed_day';
  if (state.sentToday) return 'already_sent';
  if (p.hour < h.hour) return 'not_yet';
  if (p.hour > h.hour + 1) return 'too_late';
  if (state.postedToday) return 'already_posted';
  return true;
}
