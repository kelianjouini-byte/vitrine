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
