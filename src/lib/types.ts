export type BusinessType =
  | 'fleuriste' | 'boulangerie' | 'patisserie' | 'coiffure' | 'beaute' | 'restaurant'
  | 'vetements' | 'epicerie' | 'artisan' | 'chocolatier' | 'caviste' | 'autre';

export type Tone = 'chaleureux' | 'elegant' | 'dynamique' | 'humoristique' | 'premium' | 'familial' | 'traditionnel';

export type Platform = 'instagram' | 'facebook';

export interface Business {
  id?: string;
  ownerFirstName: string;
  businessName: string;
  businessType: BusinessType;
  city: string;
  postalCode: string;
  tone: Tone;
  audience?: string;
  description?: string;
  specialties?: string;
}

/** Statuts imposés par le cahier des charges (section 15). */
export type PostStatus =
  | 'draft' | 'generating' | 'awaiting_approval' | 'scheduled' | 'publishing'
  | 'published' | 'partially_published' | 'failed' | 'cancelled';

export type PublicationStatus = 'pending' | 'published' | 'failed' | 'not_configured';

export interface PublicationResult {
  platform: Platform;
  status: PublicationStatus;
  url?: string | null;
  error?: string | null;
  publishedAt?: string | null;
}

export interface GeneratedPost {
  instagramCaption: string;
  facebookCaption: string;
  hashtags: string[];
  callToAction?: string;
  photoDescription?: string;
  improvementTip?: string | null;
  /** true si le texte vient du modèle d'exemple local (IA non branchée). */
  isExample?: boolean;
}

export interface Post {
  id: string;
  imageUri: string;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  status: PostStatus;
  occasionId?: string | null;
  createdAt: string;
  publishedAt?: string | null;
  publications: PublicationResult[];
}

export interface NotificationPrefs {
  enabled: boolean;
  daysBefore: number;
  hour: number;
}

export interface SocialConnection {
  platform: Platform;
  status: 'connected' | 'disconnected' | 'expired';
  accountName?: string;
}
