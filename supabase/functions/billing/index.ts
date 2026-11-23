// Abonnement du commerçant. POST {action}
//  - 'status'   : offres, fin de l'essai gratuit (15 jours), accès (essai, payé, terminé), abonnement en cours, paiement activé ou non
//  - 'checkout' : {plan, returnUrl, referralCode?} -> lien vers la page de paiement Stripe (carte enregistrée, 1er prélèvement à la fin de l'essai gratuit)
//  - 'portal'   : {returnUrl} -> lien vers l'espace Stripe (carte, factures, résiliation selon l'offre)
// Les changements d'état arrivent ensuite par le webhook Stripe (fonction stripe-webhook).
import { handler, json, HttpError, env } from '../_shared/http.ts';
import { requireMerchant, requirePatron } from '../_shared/db.ts';
import { accessState, isPlanId, PLAN_IDS, trialEndsAt } from '../_shared/billing.ts';
import { portalConfiguration, stripe, stripeConfigured } from '../_shared/stripe.ts';
import { createCheckout, founderFor } from '../_shared/checkout.ts';
import { companyMonthlyCents, isPatron } from '../_shared/team.ts';

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

  const founder = () => founderFor(db, sub);

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
    const url = await createCheckout(db, {
      business, email: user.email, sub, plan: body.plan, back: safeReturn(body.returnUrl),
      referralCode: body.referralCode || undefined,
    });
    return json({ url });
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
