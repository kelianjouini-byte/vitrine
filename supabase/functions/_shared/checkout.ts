// Création d'une page de paiement Stripe pour l'abonnement d'une entreprise (boutique principale).
// Utilisée par l'appli (fonction billing) et par les liens des e-mails de fin d'essai (fonction trial-emails).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { HttpError } from './http.ts';
import { founderOffer, isLive, stripeTrialEnd, type FounderOffer, type PlanId } from './billing.ts';
import { extraShopPriceFor, priceFor, stripe } from './stripe.ts';
import { findReferrer, refereeCoupon } from './referralServer.ts';

// deno-lint-ignore no-explicit-any
type Row = any;

/** Offre fondateur : places restantes (abonnements fondateur en cours) et droit de cette entreprise à la prendre. */
export async function founderFor(db: SupabaseClient, sub: Row | null): Promise<FounderOffer | null> {
  const { data: plan } = await db.from('plans').select('active, places').eq('id', 'founder').maybeSingle();
  const { count } = await db.from('subscriptions').select('business_id', { count: 'exact', head: true })
    .eq('plan', 'founder').not('stripe_subscription_id', 'is', null).in('status', ['trialing', 'active', 'past_due', 'unpaid', 'paused']);
  return founderOffer(plan, count ?? 0, sub);
}

/**
 * Page de paiement Stripe (carte enregistrée, 1er prélèvement à la fin de l'essai gratuit).
 * back = adresse de retour déjà vérifiée ; « paiement=ok » ou « paiement=annule » y est ajouté.
 */
export async function createCheckout(db: SupabaseClient, opts: {
  business: Row; email: string; sub: Row | null; plan: PlanId; back: string; referralCode?: string;
}): Promise<string> {
  const { business, email, sub, plan: planId, back } = opts;
  if (sub && isLive(sub.status) && sub.stripe_subscription_id) throw new HttpError(409, 'already_subscribed', 'Vous avez déjà un abonnement.');
  const { data: plan } = await db.from('plans').select('monthly_price_cents, extra_shop_price_cents, active').eq('id', planId).single();
  if (!plan || !plan.active) throw new HttpError(400, 'bad_plan', "Cette offre n'est plus proposée.");
  if (planId === 'founder' && !(await founderFor(db, sub))?.eligible) {
    throw new HttpError(409, 'founder_full', "Les places de l'offre fondateur sont toutes prises. Choisissez l'offre Mensuel ou Annuel.");
  }
  const { data: extraShops } = await db.from('businesses').select('id').eq('main_business_id', business.id);
  const extraCount = extraShops?.length ?? 0;
  const price = await priceFor(planId, plan.monthly_price_cents);
  // Boutiques déjà ajoutées (ex. abonnement repris après une résiliation) : une ligne « Boutique en plus » × leur nombre.
  const extraLine = extraCount ? [{ price: await extraShopPriceFor(planId, plan.extra_shop_price_cents), quantity: extraCount }] : [];
  // Code de parrainage (facultatif) : vérifié ici, jamais cru sur parole depuis l'appli.
  const referral = opts.referralCode ? await findReferrer(db, business, opts.referralCode) : null;
  const referralMeta = referral ? { referrer_business_id: referral.referrerId, referral_code: referral.code } : {};

  // Un seul client Stripe par boutique.
  let customer = sub?.stripe_customer_id as string | undefined;
  if (!customer) {
    const c = await stripe<{ id: string }>('POST', 'customers', {
      email, name: business.business_name ?? undefined, metadata: { business_id: business.id },
      preferred_locales: ['fr'],
    });
    customer = c.id;
    await db.from('subscriptions').upsert({ business_id: business.id, stripe_customer_id: customer }, { onConflict: 'business_id' });
  }

  const sep = back.includes('?') ? '&' : '?';
  const trialEnd = stripeTrialEnd(business.created_at);
  const session = await stripe<{ url: string }>('POST', 'checkout/sessions', {
    mode: 'subscription',
    customer,
    locale: 'fr',
    line_items: [{ price, quantity: 1 }, ...extraLine],
    client_reference_id: business.id,
    subscription_data: {
      metadata: { business_id: business.id, plan: planId, ...referralMeta },
      ...(trialEnd ? { trial_end: trialEnd } : {}),
    },
    metadata: { business_id: business.id, plan: planId, ...referralMeta },
    ...(referral ? { discounts: [{ coupon: await refereeCoupon() }] } : {}),
    payment_method_collection: 'always',
    // Facture entre professionnels : le nom et l'adresse de la boutique doivent y figurer.
    billing_address_collection: 'required',
    customer_update: { address: 'auto', name: 'auto' },
    success_url: `${back}${sep}paiement=ok`,
    cancel_url: `${back}${sep}paiement=annule`,
  });
  return session.url;
}
