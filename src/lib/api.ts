/**
 * Toutes les actions qui passent par le serveur Vitrine (Supabase Edge Functions).
 *
 * Règle d'or du cahier des charges : JAMAIS de faux succès.
 * Si le serveur, l'IA ou Meta ne sont pas branchés, on lève NotConfiguredError
 * et l'écran l'affiche clairement.
 */
import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import type { Business, GeneratedPost, Platform, PublicationResult, SocialConnection } from './types';
import { tradeLabel } from './business';
import type { CommercialEvent } from './events';

export class NotConfiguredError extends Error {
  constructor(public what: 'serveur' | 'ia' | 'meta' | 'compte') {
    super(`${what} non configuré`);
  }
}

export class FriendlyError extends Error {}

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
    throw new FriendlyError(payload?.message ?? 'Le serveur ne répond pas. Vérifiez votre connexion et réessayez.');
  }
  return data as T;
}

// ---------------------------------------------------------------- Compte

export async function sendLoginCode(email: string): Promise<void> {
  const sb = requireBackend();
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw new FriendlyError("Impossible d'envoyer le code. Vérifiez l'adresse e-mail.");
}

export async function verifyLoginCode(email: string, code: string): Promise<void> {
  const sb = requireBackend();
  const { error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
  if (error) throw new FriendlyError("Ce code n'est pas bon ou a expiré.");
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
  imagePath: string;
  /** Consigne du métier pour l'IA (catalogue src/lib/trades.ts). */
  tradeHint?: string;
  occasion?: Pick<CommercialEvent, 'name' | 'date'> | null;
  merchantNote?: string;
  postId?: string;
}

export async function generatePost(input: GenerateInput): Promise<GeneratedPost & { postId: string }> {
  return callFunction('generate-post', {
    image_path: input.imagePath,
    post_id: input.postId,
    occasion: input.occasion ? { name: input.occasion.name, date: input.occasion.date.toISOString().slice(0, 10) } : null,
    merchant_note: input.merchantNote ?? null,
    trade_hint: input.tradeHint ?? null,
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

/** Cherche le métier du commerce sur internet à partir de son nom et de sa ville. null = pas trouvé. */
export async function detectTrade(input: { businessName: string; city: string; postalCode: string }): Promise<string | null> {
  if (!supabase) return null;
  if (!(await ensureSession())) return null;
  const res = await callFunction<{ trade: string | null }>('business-ai', {
    action: 'detect',
    business_name: input.businessName,
    city: input.city,
    postal_code: input.postalCode,
  });
  return res.trade;
}

/** Pour un métier hors liste : l'IA choisit les occasions qui lui conviennent. */
export async function suggestOccasionKeys(trade: string, catalog: { key: string; name: string; description: string }[]): Promise<string[]> {
  if (!supabase) return [];
  if (!(await ensureSession())) return [];
  const res = await callFunction<{ keys: string[] }>('business-ai', { action: 'occasions', trade, catalog });
  return res.keys;
}

// ---------------------------------------------------------------- Publication

export interface PublishInput {
  postId: string;
  caption: string;
  hashtags: string[];
  platforms: Platform[];
  /** Clé d'idempotence : la même publication ne partira jamais deux fois. */
  idempotencyKey: string;
}

export async function publishPost(input: PublishInput): Promise<PublicationResult[]> {
  const res = await callFunction<{ publications: PublicationResult[] }>('publish-post', {
    post_id: input.postId,
    caption: input.caption,
    hashtags: input.hashtags,
    platforms: input.platforms,
    idempotency_key: input.idempotencyKey,
  });
  return res.publications;
}

// ---------------------------------------------------------------- Meta

/** Retourne l'URL officielle de connexion Meta (OAuth). Aucun mot de passe ne passe par Vitrine. */
export async function metaLoginUrl(redirectUri: string): Promise<string> {
  const res = await callFunction<{ url: string }>('meta-oauth', { action: 'start', redirect_uri: redirectUri });
  return res.url;
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
