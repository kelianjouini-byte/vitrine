/** Identifiant d'un métier du catalogue (src/lib/trades.ts). 'autre' = métier hors liste. */
export type BusinessType =
  | 'fleuriste' | 'boulangerie' | 'patisserie' | 'chocolatier' | 'caviste' | 'coiffure' | 'beaute'
  | 'restaurant' | 'vetements' | 'epicerie' | 'boucherie' | 'poissonnerie' | 'fromagerie' | 'primeur'
  | 'bar' | 'barbier' | 'bijouterie' | 'opticien' | 'librairie' | 'cadeaux' | 'jouets' | 'chaussures'
  | 'toilettage' | 'jardinerie' | 'onglerie' | 'tatoueur' | 'cordonnerie' | 'pressing' | 'artisan'
  | 'traiteur' | 'autre';

export type Tone = 'chaleureux' | 'elegant' | 'dynamique' | 'humoristique' | 'premium' | 'familial' | 'traditionnel';

export type Platform = 'instagram' | 'facebook';

export interface Business {
  id?: string;
  ownerFirstName: string;
  businessName: string;
  businessType: BusinessType;
  /** Le métier tel que le commerçant l'a écrit (« Tatoueur », « Épicerie fine »...). Envoyé à l'IA. */
  trade?: string;
  /** Occasions choisies pour un métier hors liste (clés d'occasion, sans l'année). */
  occasionKeys?: string[];
  city: string;
  postalCode: string;
  tone: Tone;
  audience?: string;
  description?: string;
  /** Produits et spécialités (« Vos produits » dans la carte d'identité). */
  specialties?: string;
  /** Ce qui rend la boutique unique : « fait maison », « bio », « 3e génération »... */
  strengths?: string;
}

/** Une idée de publication proposée par l'assistant « Je ne sais pas quoi poster ». */
export interface PostIdea {
  title: string;
  /** Ce qu'il faut prendre en photo. */
  photo: string;
  /** Pourquoi c'est une bonne idée maintenant. */
  why: string;
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
  /** Rappel du lundi « 3 idées pour votre semaine » (activé si absent). */
  weeklyIdeas?: boolean;
}

export interface SocialConnection {
  platform: Platform;
  status: 'connected' | 'disconnected' | 'expired';
  accountName?: string;
}
