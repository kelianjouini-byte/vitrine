// Abonnement du commerçant. POST {action}
//  - 'status'   : offres, fin de l'essai gratuit (15 jours), accès (essai, payé, terminé), abonnement en cours, paiement activé ou non
//  - 'checkout' : {plan, returnUrl, referralCode?} -> lien vers la page de paiement Stripe (carte enregistrée, 1er prélèvement à la fin de l'essai gratuit)
//  - 'portal'   : {returnUrl} -> lien vers l'espace Stripe (carte, factures, résiliation selon l'offre)
// Les changements d'état arrivent ensuite par le webhook Stripe (fonction stripe-webhook).
import { handler, json, HttpError, env } from '../_shared/http.ts';
import { requireMerchant, requirePatron } from '../_shared/db.ts';
import { accessState, founderOffer, isLive, isPlanId, PLAN_IDS, stripeTrialEnd, trialEndsAt } from '../_shared/billing.ts';
import { extraShopPriceFor, portalConfiguration, priceFor, stripe, stripeConfigured } from '../_shared/stripe.ts';
import { companyMonthlyCents, isPatron } from '../_shared/team.ts';
import { findReferrer, refereeCoupon } from '../_shared/referralServer.ts';

/** On ne renvoie le commerçant que vers l'appli Vitrine (jamais vers une adresse donnée par un tiers). */
function safeReturn(url: unknown): string {
  const allowed = [env('PUBLIC_APP_URL'), env('PUBLIC_SITE_URL'), 'https://vitrineappli.fr/app', 'https://kelianjouini-byte.github.io/vitrine'].filter(Boolean) as string[];
  const u = typeof url === 'string' ? url : '';
  if (allowed.some((a) => u.startsWith(a.replace(/\/$/, '') + '/'))) return u;
  return `${(env('PUBLIC_APP_URL') ?? allowed[0]).replace(/\/$/, '')}/abonnement`;
}

Deno.serve(handler(async (req) => {
  // L'abonnement est celui de l'entreprise (boutique principale), quelle que soit la boutique ouverte.
  const { db, user, company: business, member } = await requireMerchant(req);
  const body = await req.json().catch(() => ({}));
  const { data: sub } = await db.from('subscriptions').select('*').eq('business_id', business.id).maybeSingle();
  // Boutiques de l'entreprise (la principale en premier) : la 1re au prix de l'offre, les autres au prix « boutique en plus ».
  const { data: extraShops } = await db.from('businesses').select('id, business_name, city').eq('main_business_id', business.id).order('created_at');
  const extraCount = extraShops?.length ?? 0;

  /** Offre fondateur : places restantes (abonnements fondateur en cours) et droit de cette boutique à la prendre. */
  async function founder() {
    const { data: plan } = await db.from('plans').select('active, places').eq('id', 'founder').maybeSingle();
    const { count } = await db.from('subscriptions').select('business_id', { count: 'exact', head: true })
      .eq('plan', 'founder').not('stripe_subscription_id', 'is', null).in('status', ['trialing', 'active', 'past_due', 'unpaid', 'paused']);
    return founderOffer(plan, count ?? 0, sub);
  }

  if (body.action === 'status') {
    const access = accessState(business.created_at, sub);
    // Un employé n'a besoin que de savoir si l'appli est ouverte (il ne voit ni les prix ni le paiement).
    if (!isPatron(member.role)) {
      return json({ configured: stripeConfigured(), access, role: member.role, trialStartedAt: business.created_at, trialEndsAt: trialEndsAt(business.created_at).toISOString(), plans: [], subscription: null, shops: [], founder: null });
    }
    const { data: plans } = await db.from('plans').select('id, name, monthly_price_cents, commitment_months, extra_shop_price_cents').in('id', PLAN_IDS);
    const current = (plans ?? []).find((p) => p.id === sub?.plan);
    return json({
      configured: stripeConfigured(),
      access,
      role: member.role,
      trialStartedAt: business.created_at,
      trialEndsAt: trialEndsAt(business.created_at).toISOString(),
      plans: plans ?? [],
      shops: [{ id: business.id, name: `${business.business_name} · ${business.city}` }, ...(extraShops ?? []).map((s) => ({ id: s.id, name: `${s.business_name} · ${s.city}` }))],
      founder: await founder(),
      monthlyTotalCents: current ? companyMonthlyCents(current.monthly_price_cents, current.extra_shop_price_cents, 1 + extraCount) : null,
      subscription: sub && sub.stripe_subscription_id
        ? {
          plan: sub.plan, status: sub.status, currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end, trialEnd: sub.trial_end, commitmentEndsAt: sub.commitment_ends_at,
          founderNumber: sub.founder_number ?? null,
        }
        : null,
    });
  }

  requirePatron(member);

  if (body.action === 'checkout') {
    if (!isPlanId(body.plan)) throw new HttpError(400, 'bad_plan', 'Offre inconnue.');
    if (!user.email || user.is_anonymous) throw new HttpError(400, 'account_not_protected', "Ajoutez d'abord votre e-mail pour protéger votre compte.");
    if (sub && isLive(sub.status) && sub.stripe_subscription_id) throw new HttpError(409, 'already_subscribed', 'Vous avez déjà un abonnement.');
    const { data: plan } = await db.from('plans').select('monthly_price_cents, extra_shop_price_cents, active').eq('id', body.plan).single();
    if (!plan || !plan.active) throw new HttpError(400, 'bad_plan', "Cette offre n'est plus proposée.");
    if (body.plan === 'founder' && !(await founder()).eligible) {
      throw new HttpError(409, 'founder_full', "Les places de l'offre fondateur sont toutes prises. Choisissez l'offre Mensuel ou Annuel.");
    }
    const price = await priceFor(body.plan, plan.monthly_price_cents);
    // Boutiques déjà ajoutées (ex. abonnement repris après une résiliation) : une ligne « Boutique en plus » × leur nombre.
    const extraLine = extraCount ? [{ price: await extraShopPriceFor(body.plan, plan.extra_shop_price_cents), quantity: extraCount }] : [];
    // Code de parrainage (facultatif) : vérifié ici, jamais cru sur parole depuis l'appli.
    const referral = body.referralCode ? await findReferrer(db, business, body.referralCode) : null;
    const referralMeta = referral ? { referrer_business_id: referral.referrerId, referral_code: referral.code } : {};

    // Un seul client Stripe par boutique.
    let customer = sub?.stripe_customer_id as string | undefined;
    if (!customer) {
      const c = await stripe<{ id: string }>('POST', 'customers', {
        email: user.email, name: business.business_name ?? undefined, metadata: { business_id: business.id },
        preferred_locales: ['fr'],
      });
      customer = c.id;
      await db.from('subscriptions').upsert({ business_id: business.id, stripe_customer_id: customer }, { onConflict: 'business_id' });
    }

    const back = safeReturn(body.returnUrl);
    const sep = back.includes('?') ? '&' : '?';
    const trialEnd = stripeTrialEnd(business.created_at);
    const session = await stripe<{ url: string }>('POST', 'checkout/sessions', {
      mode: 'subscription',
      customer,
      locale: 'fr',
      line_items: [{ price, quantity: 1 }, ...extraLine],
      client_reference_id: business.id,
      subscription_data: {
        metadata: { business_id: business.id, plan: body.plan, ...referralMeta },
        ...(trialEnd ? { trial_end: trialEnd } : {}),
      },
      metadata: { business_id: business.id, plan: body.plan, ...referralMeta },
      ...(referral ? { discounts: [{ coupon: await refereeCoupon() }] } : {}),
      payment_method_collection: 'always',
      // Facture entre professionnels : le nom et l'adresse de la boutique doivent y figurer.
      billing_address_collection: 'required',
      customer_update: { address: 'auto', name: 'auto' },
      success_url: `${back}${sep}paiement=ok`,
      cancel_url: `${back}${sep}paiement=annule`,
    });
    return json({ url: session.url });
  }

  if (body.action === 'portal') {
    if (!sub?.stripe_customer_id) throw new HttpError(400, 'no_subscription', "Vous n'avez pas encore d'abonnement.");
    const locked = sub.plan === 'annual' && sub.commitment_ends_at && new Date(sub.commitment_ends_at) > new Date();
    const session = await stripe<{ url: string }>('POST', 'billing_portal/sessions', {
      customer: sub.stripe_customer_id,
      locale: 'fr',
      configuration: await portalConfiguration(locked ? 'locked' : 'free'),
      return_url: safeReturn(body.returnUrl),
    });
    return json({ url: session.url });
  }

  throw new HttpError(400, 'bad_action', 'Action inconnue.');
}));
