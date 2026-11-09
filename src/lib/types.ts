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
  /** Boutique ajoutée à un compte (offre plusieurs boutiques) : id de la boutique principale. Vide pour la principale. */
  mainBusinessId?: string | null;
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
  /** Jours de fermeture (0 = lundi ... 6 = dimanche) : le planning y met « Repos ». */
  closedDays?: number[];
  /** Réponses aux jours fériés (« ferie-11-novembre-2026 ») : ouvert ou fermé, et horaires si le commerçant les a écrits. */
  holidays?: Record<string, HolidayAnswer>;
}

export interface HolidayAnswer {
  open: boolean;
  /** Horaires écrits par le commerçant (jamais inventés). */
  hours?: string;
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
  /** « post » (fil, avec texte) ou « story » (plein écran, 24 h, sans texte). « post » si absent : anciens posts. */
  kind?: 'post' | 'story';
  /** Story en vidéo : pas d'image gardée sur le téléphone (une vidéo est trop lourde). */
  mediaType?: 'photo' | 'video';
  /** 1re photo (seule gardée sur le téléphone). Vide pour une story vidéo. */
  imageUri: string;
  /** Nombre de photos du carrousel (1 si absent : anciens posts). */
  photoCount?: number;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  status: PostStatus;
  occasionId?: string | null;
  createdAt: string;
  publishedAt?: string | null;
  /** Post préparé à l'avance dans le planning (statut « scheduled ») : jour et heure prévus. */
  scheduledFor?: string | null;
  /** Chemins des photos sur le serveur, gardés pour publier plus tard un post préparé à l'avance. */
  imagePaths?: string[];
  /** Clé anti-doublon de la publication (un post préparé n'est publié qu'une fois). */
  idempotencyKey?: string;
  publications: PublicationResult[];
  /** Post d'un employé envoyé à son patron : en attente, validé ou refusé (avec un petit mot). */
  reviewState?: 'pending' | 'approved' | 'rejected' | null;
  reviewNote?: string | null;
}

export interface NotificationPrefs {
  enabled: boolean;
  daysBefore: number;
  hour: number;
  /** Rappel du lundi « 3 idées pour votre semaine » (activé si absent). */
  weeklyIdeas?: boolean;
  /** Le 1er du mois : « Votre bilan de [mois] est prêt » (activé si absent). */
  monthlyReport?: boolean;
  /** Rappels du planning : « Votre post est prêt », « Idée de story du jour » (activé si absent). */
  planReminders?: boolean;
}

export interface SocialConnection {
  platform: Platform;
  status: 'connected' | 'disconnected' | 'expired';
  accountName?: string;
}
