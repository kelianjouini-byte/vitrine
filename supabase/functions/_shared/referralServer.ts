// Parrainage, côté serveur : codes, vérification du code au paiement, protections, crédit du parrain.
// Les règles elles-mêmes (montants, forme du code, « même personne ») sont dans referral.ts (testées).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { HttpError } from './http.ts';
import { isLive } from './billing.ts';
import { stripe } from './stripe.ts';
import {
  looksLikeCode, makeCode, normalizeCode, referrerCredit, REFEREE_DISCOUNT_CENTS, REFEREE_DISCOUNT_MONTHS, samePayer, type Payer,
} from './referral.ts';

type Business = { id: string; business_name: string };

function cryptoRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

/** Le code du commerçant (créé la 1re fois qu'il ouvre « Recommander Vitrine »). */
export async function myCode(db: SupabaseClient, business: Business): Promise<string> {
  const { data } = await db.from('referral_codes').select('code').eq('business_id', business.id).maybeSingle();
  if (data?.code) return data.code;
  for (let i = 0; i < 5; i++) {
    const code = makeCode(business.business_name, cryptoRandom);
    const { error } = await db.from('referral_codes').insert({ business_id: business.id, code });
    if (!error) return code;
    // Deux appels en même temps : le code a peut-être été créé entre-temps.
    const { data: again } = await db.from('referral_codes').select('code').eq('business_id', business.id).maybeSingle();
    if (again?.code) return again.code;
  }
  throw new HttpError(500, 'internal', 'Le code n\'a pas pu être créé. Réessayez.');
}

/**
 * Vérifie le code tapé par le futur filleul. Refuse : code inconnu, son propre code, boutique déjà parrainée.
 * Les essais sont limités (10 par heure) pour qu'on ne puisse pas deviner un code au hasard.
 */
export async function findReferrer(db: SupabaseClient, business: Business, raw: unknown) {
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await db.from('referral_checks').select('id', { count: 'exact', head: true }).eq('business_id', business.id).gte('created_at', since);
  if ((count ?? 0) >= 10) throw new HttpError(429, 'rate_limited', 'Trop d\'essais. Réessayez dans une heure.');
  await db.from('referral_checks').insert({ business_id: business.id });

  const code = normalizeCode(raw);
  const unknown = new HttpError(400, 'bad_referral_code', 'Ce code n\'existe pas. Vérifiez les lettres et les chiffres.');
  if (!looksLikeCode(code)) throw unknown;
  const { data: owner } = await db.from('referral_codes').select('business_id').eq('code', code).maybeSingle();
  if (!owner) throw unknown;
  if (owner.business_id === business.id) throw new HttpError(400, 'own_referral_code', 'C\'est votre propre code : il sert à vos voisins commerçants.');
  const { data: already } = await db.from('referrals').select('id').eq('referee_business_id', business.id).maybeSingle();
  if (already) throw new HttpError(400, 'already_referred', 'Votre boutique a déjà utilisé un code de parrainage.');
  const { data: referrer } = await db.from('businesses').select('id, business_name').eq('id', owner.business_id).single();
  if (!referrer) throw unknown;
  return { code, referrerId: referrer.id as string, referrerName: referrer.business_name as string };
}

/** Réduction du filleul chez Stripe : -10 € pendant 3 mois. Créée automatiquement la 1re fois. */
export async function refereeCoupon(): Promise<string> {
  const id = 'vitrine_parrainage_filleul';
  try {
    await stripe('POST', 'coupons', {
      id, amount_off: REFEREE_DISCOUNT_CENTS, currency: 'eur', duration: 'repeating', duration_in_months: REFEREE_DISCOUNT_MONTHS,
      name: 'Parrainage : -10 € pendant 3 mois',
    });
  } catch (e) {
    if (!(e instanceof HttpError && e.code === 'exists')) throw e;
  }
  return id;
}

type ExpandedSub = {
  id: string;
  default_payment_method?: { card?: { fingerprint?: string } } | null;
  customer?: { id: string; name?: string | null; address?: Payer['address']; balance?: number } | string;
};

/** Qui paie un abonnement : empreinte de la carte (jamais le numéro), nom et adresse de facturation. */
async function payerOf(subscriptionId: string): Promise<Payer> {
  const sub = await stripe<ExpandedSub>('GET', `subscriptions/${subscriptionId}`, { expand: ['default_payment_method', 'customer'] });
  const c = typeof sub.customer === 'object' ? sub.customer : null;
  return { cardFingerprint: sub.default_payment_method?.card?.fingerprint ?? null, name: c?.name ?? null, address: c?.address ?? null };
}

/**
 * Dès que Stripe confirme l'abonnement du filleul (le code est rangé dans l'abonnement) : on enregistre le parrainage,
 * puis on vérifie que ce n'est pas la même personne que le parrain. Si c'est le cas, on bloque :
 * pas de crédit pour le parrain, et on retire la réduction du filleul.
 */
export async function recordReferral(db: SupabaseClient, refereeId: string, referrerId: string, code: string, subscriptionId: string) {
  if (!referrerId || referrerId === refereeId) return;
  await db.from('referrals')
    .upsert({ referrer_business_id: referrerId, referee_business_id: refereeId, code }, { onConflict: 'referee_business_id', ignoreDuplicates: true });
  const { data: row } = await db.from('referrals').select('id, referrer_business_id, status').eq('referee_business_id', refereeId).maybeSingle();
  // Autre parrain déjà enregistré, ou parrainage déjà vérifié : rien à refaire (Stripe renvoie parfois les événements).
  if (!row || row.referrer_business_id !== referrerId || row.status !== 'pending') return;

  const { data: parent } = await db.from('subscriptions').select('stripe_subscription_id').eq('business_id', referrerId).maybeSingle();
  const referee = await payerOf(subscriptionId);
  const referrer = parent?.stripe_subscription_id ? await payerOf(parent.stripe_subscription_id) : {};
  const reason = samePayer(referee, referrer);
  if (!reason) return;
  await db.from('referrals').update({ status: 'blocked', blocked_reason: reason }).eq('id', row.id);
  await stripe('DELETE', `subscriptions/${subscriptionId}/discount`).catch(() => {});
  console.log('[vitrine] parrainage bloqué', refereeId, reason);
}

/**
 * Une facture du filleul est payée (invoice.paid, montant > 0) : le parrain gagne 10 € de crédit chez Stripe,
 * déduit automatiquement de sa prochaine facture. Jamais plus qu'un mois de son abonnement en réserve.
 */
export async function rewardReferrer(db: SupabaseClient, refereeId: string, invoiceId: string) {
  const { data: ref } = await db.from('referrals').select('id, status, referrer_business_id').eq('referee_business_id', refereeId).maybeSingle();
  if (!ref || ref.status === 'blocked' || ref.status === 'ended') return;
  if (ref.status === 'pending') await db.from('referrals').update({ status: 'active', activated_at: new Date().toISOString() }).eq('id', ref.id);

  const { data: parent } = await db.from('subscriptions').select('stripe_customer_id, stripe_subscription_id, status, plan').eq('business_id', ref.referrer_business_id).maybeSingle();
  // Le parrain n'a pas (ou plus) d'abonnement payant : il n'y a rien à réduire ce mois-ci.
  if (!parent?.stripe_customer_id || !parent.stripe_subscription_id || !isLive(parent.status)) return;
  const { data: plan } = await db.from('plans').select('monthly_price_cents').eq('id', parent.plan).maybeSingle();
  const customer = await stripe<{ balance?: number }>('GET', `customers/${parent.stripe_customer_id}`);
  // Chez Stripe, un solde négatif = du crédit en réserve.
  // Plusieurs boutiques : le plafond reste le prix de la 1re boutique (plan), jamais celui des boutiques en plus.
  // Les boutiques ajoutées par le parrain lui-même ne passent jamais par ici (elles n'ont pas de code de parrainage).
  const amount = referrerCredit(-(customer.balance ?? 0), plan?.monthly_price_cents ?? 2900);

  // Une facture ne rapporte qu'une fois, même si Stripe renvoie l'événement.
  const { error: dup } = await db.from('referral_rewards').insert({ invoice_id: invoiceId, referral_id: ref.id, amount_cents: amount });
  if (dup || amount <= 0) return;
  try {
    const { data: referee } = await db.from('businesses').select('business_name').eq('id', refereeId).maybeSingle();
    await stripe('POST', `customers/${parent.stripe_customer_id}/balance_transactions`, {
      amount: -amount, currency: 'eur', description: `Parrainage : ${referee?.business_name ?? 'un commerçant'}`,
      metadata: { invoice_id: invoiceId, referral_id: ref.id },
    });
  } catch (e) {
    await db.from('referral_rewards').delete().eq('invoice_id', invoiceId);
    throw e;
  }
}

/** Le filleul a arrêté son abonnement : son parrain ne gagne plus rien pour lui. */
export async function endReferral(db: SupabaseClient, refereeId: string) {
  await db.from('referrals').update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('referee_business_id', refereeId).in('status', ['pending', 'active']);
}
