// Équipe, côté serveur : chiffrement des codes de connexion, droits, synchronisation du prix des boutiques chez Stripe.
// Les règles elles-mêmes (forme du code, rôles, prix) sont dans team.ts (testées).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { env, HttpError } from './http.ts';
import type { Member } from './db.ts';
import { isLive, type PlanId } from './billing.ts';
import { extraShopPriceFor, stripe } from './stripe.ts';
import { makeLoginCode } from './team.ts';

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * Clé de chiffrement des codes : celle des jetons Meta si elle est posée, sinon une clé dérivée de la clé serveur.
 * (Si la clé change, le patron fait simplement « Faire un nouveau code ».)
 */
async function codeKey(): Promise<CryptoKey> {
  const raw = env('TOKEN_ENCRYPTION_KEY');
  const bytes = raw
    ? unb64(raw)
    : new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`vitrine-team-codes:${env('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`)));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptCode(code: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await codeKey(), new TextEncoder().encode(code)));
  return `c1:${b64(iv)}:${b64(ct)}`;
}

/** null si le code n'est plus lisible (clé changée) : le patron en refait un. */
export async function decryptCode(blob: string): Promise<string | null> {
  try {
    const [v, iv, ct] = blob.split(':');
    if (v !== 'c1') return null;
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await codeKey(), unb64(ct));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
export const newLoginCode = () => makeLoginCode(cryptoRandom);

/** Mot de passe technique, long et aléatoire : jamais montré, changé à chaque connexion par code. */
export function strongPassword(): string {
  return b64(crypto.getRandomValues(new Uint8Array(32)));
}

/** Un employé sans « Publie seul » ne publie pas lui-même : il envoie au patron. */
export function needsApproval(member: Member) {
  if (!member.canPublish) throw new HttpError(403, 'needs_approval', 'Ce post doit d\'abord être validé par un patron.');
}

/**
 * Le nombre de boutiques en plus a changé : on met à jour l'abonnement Stripe (ligne « Boutique en plus » × quantité).
 * Stripe calcule seul le prorata. Sans abonnement Stripe (accès offert, paiement pas activé) : rien à faire.
 */
export async function syncExtraShops(db: SupabaseClient, companyId: string) {
  const { data: sub } = await db.from('subscriptions').select('stripe_subscription_id, status, plan').eq('business_id', companyId).maybeSingle();
  if (!sub?.stripe_subscription_id || !isLive(sub.status)) return;
  const { count } = await db.from('businesses').select('id', { count: 'exact', head: true }).eq('main_business_id', companyId);
  const extra = count ?? 0;
  const plan: PlanId = sub.plan === 'annual' ? 'annual' : 'monthly';
  const { data: p } = await db.from('plans').select('extra_shop_price_cents').eq('id', plan).single();
  const price = await extraShopPriceFor(plan, p?.extra_shop_price_cents ?? (plan === 'annual' ? 1500 : 1900));
  const s = await stripe<{ items: { data: { id: string; price: { id: string; lookup_key?: string | null }; quantity: number }[] } }>('GET', `subscriptions/${sub.stripe_subscription_id}`);
  const item = s.items.data.find((i) => i.price.id === price || (i.price.lookup_key ?? '').startsWith('vitrine_boutique_'));
  if (extra === 0) {
    if (item) await stripe('DELETE', `subscription_items/${item.id}`, { proration_behavior: 'create_prorations' });
  } else if (item) {
    if (item.quantity !== extra || item.price.id !== price) await stripe('POST', `subscription_items/${item.id}`, { quantity: extra, price, proration_behavior: 'create_prorations' });
  } else {
    await stripe('POST', 'subscription_items', { subscription: sub.stripe_subscription_id, price, quantity: extra, proration_behavior: 'create_prorations' });
  }
}
