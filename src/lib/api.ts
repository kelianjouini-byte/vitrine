/**
 * Toutes les actions qui passent par le serveur Vitrine (Supabase Edge Functions).
 *
 * Règle d'or du cahier des charges : JAMAIS de faux succès.
 * Si le serveur, l'IA ou Meta ne sont pas branchés, on lève NotConfiguredError
 * et l'écran l'affiche clairement.
 */
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import type { Business, GeneratedPost, Platform, PostIdea, PublicationResult, SocialConnection, Tone } from './types';
import { tradeLabel } from './business';
import type { CommercialEvent } from './events';
import type { RemotePost } from './sync';
import type { BillingStatus, PlanId } from './billing';

export class NotConfiguredError extends Error {
  constructor(public what: 'serveur' | 'ia' | 'meta' | 'compte' | 'paiement') {
    super(`${what} non configuré`);
  }
}

export class FriendlyError extends Error {}

/** Le compte n'a pas encore d'e-mail : il faut le protéger avant de s'abonner. */
export class AccountNotProtectedError extends FriendlyError {}

function requireBackend() {
  if (!supabase) throw new NotConfiguredError('serveur');
  return supabase;
}

/** Appelle une Edge Function et traduit les erreurs en messages simples. */
async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const sb = requireBackend();
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    // Le serveur renvoie { code, message } — on essaie de le lire.
    let payload: { code?: string; message?: string } | undefined;
    try {
      payload = await (error as { context?: Response }).context?.json();
    } catch {
      /* corps illisible */
    }
    if (payload?.code === 'openai_not_configured') throw new NotConfiguredError('ia');
    if (payload?.code === 'meta_not_configured') throw new NotConfiguredError('meta');
    if (payload?.code === 'stripe_not_configured') throw new NotConfiguredError('paiement');
    if (payload?.code === 'account_not_protected') throw new AccountNotProtectedError(payload.message ?? '');
    // Fonction pas encore installée sur le serveur : on le dit honnêtement.
    if ((error as { context?: Response }).context?.status === 404 && !payload?.code) throw new NotConfiguredError('serveur');
    throw new FriendlyError(payload?.message ?? 'Le serveur ne répond pas. Vérifiez votre connexion et réessayez.');
  }
  return data as T;
}

// ---------------------------------------------------------------- Compte

/** Où en est le compte sur ce téléphone : aucun, « invité » (sans e-mail) ou protégé par un e-mail. */
export type AccountState = { kind: 'none' } | { kind: 'guest' } | { kind: 'email'; email: string };

export async function accountState(): Promise<AccountState> {
  if (!supabase) return { kind: 'none' };
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return { kind: 'none' };
  return u.is_anonymous || !u.email ? { kind: 'guest' } : { kind: 'email', email: u.email };
}

/**
 * Protéger un compte invité : on lui ajoute un e-mail. C'est le MÊME compte (boutique, posts et réseaux gardés).
 * Supabase envoie un code à 6 chiffres (modèle d'e-mail « Change Email Address » avec {{ .Token }}).
 */
export async function protectAccount(email: string): Promise<void> {
  const sb = requireBackend();
  const { error } = await sb.auth.updateUser({ email });
  if (!error) return;
  if (/already|exists|registered/i.test(error.message)) {
    throw new FriendlyError('Cette adresse est déjà utilisée par un compte Vitrine. Utilisez-en une autre, ou retrouvez ce compte depuis un nouveau téléphone.');
  }
  throw new FriendlyError("Impossible d'envoyer le code. Vérifiez l'adresse e-mail et réessayez.");
}

export async function confirmProtectAccount(email: string, code: string): Promise<void> {
  const sb = requireBackend();
  const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email_change' });
  if (error) throw new FriendlyError("Ce code n'est pas bon ou a expiré. Demandez-en un nouveau.");
}

/** Retrouver son compte sur un nouveau téléphone : code envoyé par e-mail. Ne crée jamais de nouveau compte. */
export async function sendLoginCode(email: string): Promise<void> {
  const sb = requireBackend();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (!error) return;
  if (/not found|signups not allowed|user/i.test(error.message)) {
    throw new FriendlyError("Aucun compte Vitrine n'utilise cette adresse. Vérifiez-la, ou créez votre boutique.");
  }
  throw new FriendlyError("Impossible d'envoyer le code. Vérifiez l'adresse e-mail.");
}

export async function verifyLoginCode(email: string, code: string): Promise<void> {
  const sb = requireBackend();
  const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
  if (error) throw new FriendlyError("Ce code n'est pas bon ou a expiré.");
}

/** La boutique enregistrée sur le serveur (pour la retrouver sur un nouveau téléphone). */
export async function fetchBusinessRemote(): Promise<Business | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('businesses').select('*').maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    ownerFirstName: data.owner_first_name,
    businessName: data.business_name,
    businessType: data.business_type,
    trade: data.trade ?? undefined,
    occasionKeys: data.occasion_keys ?? undefined,
    city: data.city,
    postalCode: data.postal_code,
    tone: data.tone,
    audience: data.audience ?? undefined,
    description: data.description ?? undefined,
    specialties: data.specialties ?? undefined,
    strengths: data.strengths ?? undefined,
  };
}

/** L'historique enregistré sur le serveur (200 derniers posts), avec un lien temporaire vers la 1re photo. */
export async function fetchRemotePosts(): Promise<RemotePost[]> {
  if (!supabase || !(await currentUserId())) return [];
  const { data, error } = await supabase
    .from('posts')
    .select('id, status, instagram_caption, hashtags, image_url, image_urls, created_at, published_at, post_publications(platform, status, platform_post_url, error_message, published_at)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) return [];
  const first = data.map((r) => (r.image_urls?.length ? r.image_urls[0] : r.image_url) as string);
  // 7 jours : la liste est relue à chaque ouverture de l'appli, les liens sont donc renouvelés.
  const { data: signed } = await supabase.storage.from('post-images').createSignedUrls(first, 7 * 86_400);
  return data.map((r, i) => ({
    id: r.id,
    status: r.status,
    instagram_caption: r.instagram_caption,
    hashtags: r.hashtags,
    image_urls: r.image_urls,
    created_at: r.created_at,
    published_at: r.published_at,
    publications: (r.post_publications ?? []) as RemotePost['publications'],
    imageUrl: signed?.[i]?.signedUrl ?? null,
  }));
}

export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/**
 * Garantit une session. Si le commerçant ne s'est pas encore identifié par e-mail,
 * on ouvre une session « invitée » (connexion anonyme Supabase) : il peut tout tester
 * tout de suite, et sécuriser son compte par e-mail plus tard dans Réglages.
 */
export async function ensureSession(): Promise<string | null> {
  if (!supabase) return null;
  const existing = await currentUserId();
  if (existing) return existing;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) return null; // connexion invitée désactivée dans Supabase : il faudra se connecter par e-mail
  return data.user?.id ?? null;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/** Enregistre (ou met à jour) la boutique dans la base. */
export async function saveBusinessRemote(b: Business): Promise<string | undefined> {
  if (!supabase) return undefined;
  const userId = await ensureSession();
  if (!userId) return undefined;
  const row = {
    owner_id: userId,
    owner_first_name: b.ownerFirstName,
    business_name: b.businessName,
    business_type: b.businessType,
    trade: b.trade?.trim() || null,
    occasion_keys: b.occasionKeys ?? null,
    city: b.city,
    postal_code: b.postalCode,
    tone: b.tone,
    audience: b.audience ?? null,
    description: b.description ?? null,
    specialties: b.specialties ?? null,
    strengths: b.strengths?.trim() || null,
  };
  const { data, error } = await supabase.from('businesses').upsert(row, { onConflict: 'owner_id' }).select('id').single();
  if (error) throw new FriendlyError("Votre boutique n'a pas pu être enregistrée. Réessayez.");
  return data.id as string;
}

// ---------------------------------------------------------------- Photo + IA

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Envoie la photo dans le stockage privé. Retourne son chemin. */
export async function uploadPhoto(base64: string): Promise<string> {
  const sb = requireBackend();
  const userId = await currentUserId();
  if (!userId) throw new NotConfiguredError('compte');
  const path = `${userId}/${Crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from('post-images').upload(path, base64ToBytes(base64), { contentType: 'image/jpeg' });
  if (error) throw new FriendlyError("La photo n'a pas pu être envoyée. Réessayez.");
  return path;
}

export interface GenerateInput {
  /** Chemins des photos dans le stockage, dans l'ordre du carrousel (1 à 10). */
  imagePaths: string[];
  /** Consigne du métier pour l'IA (catalogue src/lib/trades.ts). */
  tradeHint?: string;
  occasion?: Pick<CommercialEvent, 'name' | 'date'> | null;
  merchantNote?: string;
  postId?: string;
  /** Idée choisie dans l'assistant : le texte suit cette idée. */
  idea?: Pick<PostIdea, 'title' | 'why'> | null;
  /** Ton choisi sur la page photo (« Changer le ton ») ; sinon celui de la boutique. */
  tone?: Tone;
}

export async function generatePost(input: GenerateInput): Promise<GeneratedPost & { postId: string }> {
  return callFunction('generate-post', {
    // image_path : pour un serveur pas encore mis à jour (une seule photo).
    image_path: input.imagePaths[0],
    image_paths: input.imagePaths,
    post_id: input.postId,
    occasion: input.occasion ? { name: input.occasion.name, date: input.occasion.date.toISOString().slice(0, 10) } : null,
    merchant_note: input.merchantNote ?? null,
    trade_hint: input.tradeHint ?? null,
    idea: input.idea ? { title: input.idea.title, why: input.idea.why } : null,
    tone: input.tone ?? null,
  });
}

/**
 * Texte d'EXEMPLE affiché quand l'IA n'est pas branchée.
 * Il ne décrit pas la photo (on ne peut pas la « voir » sans IA) et n'invente rien :
 * il sert uniquement à montrer le parcours. L'écran l'indique clairement.
 */
export function exampleCaption(b: Business, occasion?: Pick<CommercialEvent, 'name' | 'emoji'> | null): GeneratedPost {
  const cityTag = b.city.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const typeTag = tradeLabel(b).replace(/[^A-Za-zÀ-ÿ]/g, '');
  const intro = occasion ? `${occasion.emoji} ${occasion.name} approche !` : '✨ Du nouveau chez nous !';
  const text = `${intro}\nUn aperçu de ce qui vous attend chez ${b.businessName}, préparé avec soin.\nPassez nous voir à ${b.city} 😊`;
  return {
    instagramCaption: text,
    facebookCaption: text,
    hashtags: [`#${typeTag}${cityTag}`, `#${cityTag}`, `#${typeTag}`, '#CommerceLocal'],
    isExample: true,
  };
}

// ---------------------------------------------------------------- Métier (inscription)

/** Ce que la recherche sur internet a trouvé sur la boutique (pour pré-remplir, le commerçant corrige). */
export interface FoundBusiness {
  trade: string | null;
  products: string | null;
  strengths: string | null;
  audience: string | null;
}

/** Cherche la boutique sur internet à partir de son nom et de sa ville. null = pas trouvée. */
export async function detectBusiness(input: { businessName: string; city: string; postalCode: string }): Promise<FoundBusiness | null> {
  if (!supabase) return null;
  if (!(await ensureSession())) return null;
  const res = await callFunction<Partial<FoundBusiness>>('business-ai', {
    action: 'detect',
    business_name: input.businessName,
    city: input.city,
    postal_code: input.postalCode,
  });
  if (!res?.trade) return null;
  return { trade: res.trade, products: res.products ?? null, strengths: res.strengths ?? null, audience: res.audience ?? null };
}

/** Pour un métier hors liste : l'IA choisit les occasions qui lui conviennent. */
export async function suggestOccasionKeys(trade: string, catalog: { key: string; name: string; description: string }[]): Promise<string[]> {
  if (!supabase) return [];
  if (!(await ensureSession())) return [];
  const res = await callFunction<{ keys: string[] }>('business-ai', { action: 'occasions', trade, catalog });
  return res.keys;
}

// ---------------------------------------------------------------- Idées de posts

/** L'assistant « Je ne sais pas quoi poster » : 3 idées adaptées à la boutique. */
export async function fetchPostIdeas(input: { occasions: Pick<CommercialEvent, 'name' | 'date'>[]; tradeHint?: string }): Promise<PostIdea[]> {
  requireBackend();
  if (!(await ensureSession())) throw new NotConfiguredError('compte');
  const res = await callFunction<{ ideas: PostIdea[] }>('post-ideas', {
    occasions: input.occasions.slice(0, 5).map((o) => ({ name: o.name, date: localDate(o.date) })),
    trade_hint: input.tradeHint ?? null,
  });
  return Array.isArray(res?.ideas) ? res.ideas : [];
}

/** 👍 (1) ou 👎 (-1) sur une idée. Sans serveur, l'avis reste seulement sur le téléphone. */
export async function sendIdeaVote(businessId: string | undefined, ideaTitle: string, vote: 1 | -1): Promise<void> {
  if (!supabase || !businessId) return;
  const { error } = await supabase.from('post_idea_feedback').insert({ business_id: businessId, idea_title: ideaTitle.slice(0, 160), vote });
  if (error) throw new FriendlyError("Votre avis n'a pas pu être envoyé. Réessayez.");
}

// ---------------------------------------------------------------- Mon bilan

/** Le conseil du mois écrit par l'IA, à partir des VRAIS chiffres du bilan. */
export async function fetchMonthlyAdvice(input: {
  month: string;
  count: number;
  previousCount: number;
  inProgress: boolean;
  daysLeft: number;
  occasions: Pick<CommercialEvent, 'name' | 'date'>[];
  tradeHint?: string;
}): Promise<string> {
  requireBackend();
  if (!(await ensureSession())) throw new NotConfiguredError('compte');
  const res = await callFunction<{ advice?: string }>('monthly-report', {
    month: input.month,
    count: input.count,
    previous_count: input.previousCount,
    in_progress: input.inProgress,
    days_left: input.daysLeft,
    occasions: input.occasions.slice(0, 4).map((o) => ({ name: o.name, date: localDate(o.date) })),
    trade_hint: input.tradeHint ?? null,
  });
  if (!res?.advice) throw new FriendlyError("L'IA n'a pas pu écrire votre conseil. Réessayez.");
  return res.advice;
}

/** Date AAAA-MM-JJ dans le fuseau du téléphone (toISOString décalerait d'un jour en France). */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- Publication

export interface PublishInput {
  postId: string;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  /** Les photos, dans l'ordre du carrousel (le commerçant a pu les changer après le texte). */
  imagePaths: string[];
  /** Clé d'idempotence : la même publication ne partira jamais deux fois. */
  idempotencyKey: string;
}

export async function publishPost(input: PublishInput): Promise<PublicationResult[]> {
  const res = await callFunction<{ publications: PublicationResult[] }>('publish-post', {
    post_id: input.postId,
    caption: input.caption,
    hashtags: input.hashtags,
    platforms: input.platforms,
    image_paths: input.imagePaths,
    idempotency_key: input.idempotencyKey,
  });
  return res.publications;
}

export interface PublishStoryInput {
  /** Identifiant de la story (le même dans l'appli et sur le serveur). */
  storyId: string;
  platforms: Platform[];
  /** Photo (JPEG en base64) ou vidéo (adresse locale, ou fichier déjà prêt avec la musique). */
  media: { kind: 'photo'; base64: string } | { kind: 'video'; uri: string; blob?: Blob };
  idempotencyKey: string;
}

/** Formats vidéo acceptés par Instagram et Facebook pour une story. */
const STORY_VIDEO_TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov' };

/** Envoie la vidéo de la story dans le stockage privé. Retourne son chemin. */
async function uploadStoryVideo(uri: string, given?: Blob): Promise<string> {
  const sb = requireBackend();
  const userId = await currentUserId();
  if (!userId) throw new NotConfiguredError('compte');
  let blob: Blob;
  try {
    blob = given ?? (await (await fetch(uri)).blob());
  } catch {
    throw new FriendlyError("La vidéo n'a pas pu être lue. Réessayez.");
  }
  // « video/mp4;codecs=avc1 » -> « video/mp4 » ; un fichier sans type venant du téléphone est traité comme un MP4.
  const type = (blob.type || 'video/mp4').split(';')[0].trim().toLowerCase();
  const ext = STORY_VIDEO_TYPES[type];
  if (!ext) throw new FriendlyError("Ce navigateur enregistre la vidéo dans un format qu'Instagram refuse. Filmez-la avec l'appareil photo du téléphone, puis choisissez-la dans vos vidéos.");
  if (blob.size > 50 * 1024 * 1024) throw new FriendlyError('La vidéo est trop lourde. Choisissez une vidéo plus courte.');
  const path = `${userId}/${Crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('post-images').upload(path, await blob.arrayBuffer(), { contentType: type });
  if (error) throw new FriendlyError("La vidéo n'a pas pu être envoyée. Réessayez.");
  return path;
}

/** Publie une story (photo ou vidéo) sur Instagram et Facebook. Jamais de faux succès. */
export async function publishStory(input: PublishStoryInput): Promise<PublicationResult[]> {
  requireBackend();
  if (!(await ensureSession())) throw new NotConfiguredError('compte');
  // On vérifie d'abord que Meta est branché : inutile d'envoyer une vidéo pour rien.
  if (!(await metaConfigured())) throw new NotConfiguredError('meta');
  const path = input.media.kind === 'photo' ? await uploadPhoto(input.media.base64) : await uploadStoryVideo(input.media.uri, input.media.blob);
  const res = await callFunction<{ publications: PublicationResult[] }>('publish-story', {
    story_id: input.storyId,
    media_path: path,
    media_type: input.media.kind,
    platforms: input.platforms,
    idempotency_key: input.idempotencyKey,
  });
  return res.publications;
}

// ---------------------------------------------------------------- Meta

/**
 * Les clés Meta sont-elles posées sur le serveur ? Sans serveur, ou si la question échoue : non.
 * Sert à afficher « Bientôt disponible » au lieu d'un bouton qui ne marcherait pas.
 */
export async function metaConfigured(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const res = await callFunction<{ configured?: boolean }>('meta-oauth', { action: 'status' });
    return res?.configured === true;
  } catch {
    return false;
  }
}

/** Retourne l'URL officielle de connexion Meta (OAuth). Aucun mot de passe ne passe par Vitrine. */
export async function metaLoginUrl(redirectUri: string): Promise<string> {
  const res = await callFunction<{ url: string }>('meta-oauth', { action: 'start', redirect_uri: redirectUri });
  return res.url;
}

/** Une Page Facebook proposée au choix (« Sur quelle Page publier ? »). */
export interface MetaPageChoice {
  id: string;
  name: string;
  /** Le compte Instagram relié à cette Page (ex. « @vitrine »), ou null. */
  instagram: string | null;
}

/** Le compte gère plusieurs Pages : la liste à choisir (sans aucun jeton). */
export async function metaPendingPages(): Promise<MetaPageChoice[]> {
  const res = await callFunction<{ pages: MetaPageChoice[] }>('meta-oauth', { action: 'pending_pages' });
  return Array.isArray(res?.pages) ? res.pages : [];
}

/** Enregistre la Page choisie. Retourne true si un Instagram y est relié. */
export async function chooseMetaPage(pageId: string): Promise<boolean> {
  const res = await callFunction<{ instagram?: boolean }>('meta-oauth', { action: 'choose_page', page_id: pageId });
  return res?.instagram === true;
}

export async function socialConnections(): Promise<SocialConnection[]> {
  if (!supabase) return [];
  // Vue sans jetons : le client ne voit jamais les jetons Meta.
  const { data, error } = await supabase.from('social_accounts_public').select('platform, connection_status, account_name');
  if (error || !data) return [];
  return data.map((r) => ({ platform: r.platform, status: r.connection_status, accountName: r.account_name ?? undefined }));
}

export async function disconnectMeta(platform: Platform): Promise<void> {
  await callFunction('meta-oauth', { action: 'disconnect', platform });
}

// ---------------------------------------------------------------- RGPD

export async function deleteAccountRemote(): Promise<void> {
  await callFunction('account', { action: 'delete' });
}

// ---------------------------------------------------------------- Abonnement (Stripe)

export async function billingStatus(): Promise<BillingStatus> {
  if (!(await ensureSession())) throw new NotConfiguredError('compte');
  return callFunction<BillingStatus>('billing', { action: 'status' });
}

/** Lien vers la page de paiement Stripe (la carte est enregistrée, 1er prélèvement après le mois offert). */
export async function checkoutUrl(plan: PlanId, returnUrl: string): Promise<string> {
  const { url } = await callFunction<{ url: string }>('billing', { action: 'checkout', plan, returnUrl });
  return url;
}

/** Lien vers l'espace Stripe du commerçant : carte bancaire, factures, résiliation. */
export async function billingPortalUrl(returnUrl: string): Promise<string> {
  const { url } = await callFunction<{ url: string }>('billing', { action: 'portal', returnUrl });
  return url;
}
