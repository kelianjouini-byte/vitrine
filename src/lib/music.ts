/**
 * Banque de musiques des stories vidéo : des musiques créées pour Vitrine (Creatify),
 * uniques et libres de droit pour les commerçants. Fichiers dans assets/sons/.
 * Fichier « pur » (aucune dépendance React Native) : testé avec node --test.
 */

export type MusicGroup = 'ambiance' | 'fete';

export interface Track {
  id: string;
  title: string;
  group: MusicGroup;
  /** Pour les fêtes : les noms d'occasion du calendrier (src/lib/events.ts) qui vont avec. */
  occasions?: string[];
}

export const TRACKS: Track[] = [
  { id: 'cocooning', title: 'Cocooning', group: 'ambiance' },
  { id: 'douce', title: 'Douce', group: 'ambiance' },
  { id: 'joyeuse', title: 'Joyeuse', group: 'ambiance' },
  { id: 'elegante', title: 'Élégante', group: 'ambiance' },
  { id: 'cafe', title: 'Café de Paris', group: 'ambiance' },
  { id: 'entrainante', title: 'Entraînante', group: 'ambiance' },
  { id: 'nouvel-an', title: 'Nouvel An', group: 'fete', occasions: ['Nouvel An'] },
  { id: 'epiphanie', title: 'Épiphanie', group: 'fete', occasions: ['Épiphanie'] },
  { id: 'soldes', title: 'Soldes', group: 'fete', occasions: ["Soldes d'hiver", "Soldes d'été"] },
  { id: 'chandeleur', title: 'Chandeleur', group: 'fete', occasions: ['Chandeleur'] },
  { id: 'saint-valentin', title: 'Saint-Valentin', group: 'fete', occasions: ['Saint-Valentin'] },
  { id: 'mardi-gras', title: 'Mardi Gras', group: 'fete', occasions: ['Mardi Gras'] },
  { id: 'grands-parents', title: 'Grands-parents', group: 'fete', occasions: ['Fête des grands-mères', 'Fête des grands-pères'] },
  { id: 'journee-des-femmes', title: 'Journée des femmes', group: 'fete', occasions: ['Journée des droits des femmes'] },
  { id: 'saint-patrick', title: 'Saint-Patrick', group: 'fete', occasions: ['Saint-Patrick'] },
  { id: 'printemps', title: 'Printemps', group: 'fete', occasions: ['Arrivée du printemps'] },
  { id: 'poisson-d-avril', title: "Poisson d'avril", group: 'fete', occasions: ["Poisson d'avril"] },
  { id: 'paques', title: 'Pâques', group: 'fete', occasions: ['Pâques'] },
  { id: 'livre', title: 'Lecture', group: 'fete', occasions: ['Journée mondiale du livre'] },
  { id: 'muguet', title: 'Muguet du 1er mai', group: 'fete', occasions: ['Fête du Travail'] },
  { id: 'boulangerie', title: 'Fournil du matin', group: 'fete', occasions: ['Saint-Honoré'] },
  { id: 'fete-des-meres', title: 'Fête des mères', group: 'fete', occasions: ['Fête des mères'] },
  { id: 'fete-des-peres', title: 'Fête des pères', group: 'fete', occasions: ['Fête des pères'] },
  { id: 'fete-de-la-musique', title: 'Fête de la musique', group: 'fete', occasions: ['Fête de la musique'] },
  { id: 'ete', title: 'Été', group: 'fete' },
  { id: 'jardin', title: 'Jardin', group: 'fete', occasions: ['Saint-Fiacre'] },
  { id: 'rentree', title: 'Rentrée', group: 'fete', occasions: ['Rentrée'] },
  { id: 'mer', title: 'Bord de mer', group: 'fete', occasions: ['Retour des huîtres'] },
  { id: 'automne', title: 'Automne', group: 'fete' },
  { id: 'halloween', title: 'Halloween', group: 'fete', occasions: ['Halloween'] },
  { id: 'toussaint', title: 'Toussaint', group: 'fete', occasions: ['Toussaint'] },
  { id: 'movember', title: 'Movember', group: 'fete', occasions: ['Movember'] },
  { id: 'beaujolais', title: 'Beaujolais nouveau', group: 'fete', occasions: ['Beaujolais nouveau'] },
  { id: 'black-friday', title: 'Black Friday', group: 'fete', occasions: ['Black Friday', 'Cyber Monday'] },
  { id: 'saint-nicolas', title: 'Saint-Nicolas', group: 'fete', occasions: ['Saint-Nicolas'] },
  { id: 'noel', title: 'Noël', group: 'fete', occasions: ['Noël'] },
  { id: 'reveillon', title: 'Réveillon', group: 'fete', occasions: ['Réveillon'] },
];

export const DEFAULT_TRACK = 'cocooning';

export const trackById = (id: string) => TRACKS.find((t) => t.id === id);

/** Saisons sans fête précise : été (juillet, août) et automne (octobre, novembre). */
function seasonTrack(d: Date): string | null {
  const m = d.getMonth();
  if (m === 6 || m === 7) return 'ete';
  if (m === 9 || m === 10) return 'automne';
  return null;
}

/**
 * Musique proposée d'office : celle de la prochaine fête du commerçant si elle arrive bientôt
 * (dans les 10 jours, ou plus tôt si le calendrier prévient plus tôt, comme pour Noël),
 * sinon celle de la saison, sinon « Cocooning ».
 */
export function suggestTrack(upcoming: { name: string; date: Date; notifyDaysBefore?: number }[], today: Date = new Date()): string {
  const soon = upcoming.find((e) => (e.date.getTime() - today.getTime()) / 86_400_000 <= Math.max(10, e.notifyDaysBefore ?? 0));
  const forOccasion = soon && TRACKS.find((t) => t.occasions?.includes(soon.name));
  return forOccasion?.id ?? seasonTrack(today) ?? DEFAULT_TRACK;
}

/** Volume de la musique : entrée douce (1 s) et fin qui redescend (3 s) pile à la fin de la vidéo. */
export const FADE_IN_SECONDS = 1;
export const FADE_OUT_SECONDS = 3;

/** Volume (0 à 1) de la musique à l'instant `t` d'une vidéo qui dure `duration` secondes. */
export function musicVolumeAt(t: number, duration: number): number {
  if (t <= 0 || t >= duration) return 0;
  const fadeOut = Math.min(FADE_OUT_SECONDS, duration / 3);
  const fadeIn = Math.min(FADE_IN_SECONDS, duration / 4);
  return Math.min(1, t / fadeIn, (duration - t) / fadeOut);
}
