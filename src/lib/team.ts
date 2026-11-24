/**
 * Équipe et plusieurs boutiques, côté appli. Les règles viennent du serveur (supabase/functions/_shared/team.ts),
 * pour que l'appli et le serveur disent exactement la même chose.
 */
import type { Business } from './types';

export { companyMonthlyCents, isPatron, namesList, shopsLabel, LOGIN_CODE_LENGTH, normalizeLoginCode, looksLikeLoginCode, type Role } from '../../supabase/functions/_shared/team';
import type { Role } from '../../supabase/functions/_shared/team';

/** Ce que l'appli sait de l'équipe au démarrage (fonction team, action « context »). */
export interface TeamContext {
  role: Role;
  /** « Bonjour Julie » : prénom de la personne connectée. */
  firstName: string;
  /** Peut publier sans validation (patron, ou employé « Publie seul »). */
  canPublish: boolean;
  companyId: string;
  /** Prénom du créateur du compte (« Envoyé à Marie »). */
  ownerFirstName: string;
  shops: Business[];
  /** Patron : posts envoyés par les employés, à valider. */
  pending: number;
  /** Employé : ses posts en attente, et refusés ces 7 derniers jours. */
  mine: { pending: number; rejected: number };
  teamSize: number;
  /** Mes points et l'objectif de l'équipe (null tant que les points ne sont pas installés sur le serveur). */
  points?: PointsSummary | null;
  /** Le petit mot du patron, affiché sur l'accueil des employés. */
  note?: { text: string; by: string | null } | null;
}

/** L'objectif commun de l'équipe (sans date, pour tout le monde). */
export interface TeamGoal {
  id: string;
  points: number;
  reward: string;
  reachedAt: string | null;
  /** Points de l'équipe depuis que l'objectif est fixé (au plus `points`). */
  progress: number;
}

export interface PointsSummary {
  /** Mes points depuis le début (pour mon niveau). */
  mine: number;
  goal: TeamGoal | null;
}

/** Ce que le patron voit pour chaque personne : ce mois-ci et depuis le début. */
export interface MemberStats {
  prepared: number;
  published: number;
  monthPoints: number;
  totalPoints: number;
}

/** Un envoi de l'employé, relu sur le serveur (le même sur tous ses téléphones). */
export interface MySentPost {
  id: string;
  kind: 'post' | 'story';
  mediaType: 'photo' | 'video';
  caption: string;
  reviewState: 'pending' | 'approved' | 'rejected';
  reviewNote: string | null;
  status: string;
  submittedAt: string | null;
  publishedAt: string | null;
  shopId: string;
  points: number;
  thumbUrl: string | null;
}

export interface TeamMember {
  id: string;
  firstName: string;
  email: string;
  role: 'patron' | 'employe';
  /** Vide = toutes les boutiques. */
  shopIds: string[];
  canPublish: boolean;
  /** Code de connexion (null s'il n'est plus lisible : en faire un nouveau). */
  code: string | null;
  isMe: boolean;
  /** null tant que les points ne sont pas installés sur le serveur. */
  stats?: MemberStats | null;
}

export interface TeamList {
  owner: { firstName: string; email: string | null; isMe: boolean };
  members: TeamMember[];
}

/** Un post envoyé par un employé, en attente de validation. */
export interface PendingPost {
  id: string;
  kind: 'post' | 'story';
  mediaType: 'photo' | 'video';
  caption: string;
  hashtags: string[];
  platforms: ('instagram' | 'facebook')[];
  submittedAt: string;
  by: string;
  shopId: string;
  shopName: string;
  mediaUrls: string[];
}

/** Nom court d'une boutique dans le bouton de choix : « Fleurs de Marie · Aix ». */
export function shopLabel(b: Pick<Business, 'businessName' | 'city'>, many: boolean): string {
  return many ? `${b.businessName} · ${b.city}` : b.businessName;
}
