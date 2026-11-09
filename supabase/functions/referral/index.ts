// Parrainage entre commerçants. POST {action}
//  - 'mine'  : mon code, mes filleuls, mon prix avec la réduction
//  - 'check' : {code} -> le code est-il bon ? (nom de la boutique qui parraine)
// La réduction elle-même est donnée par Stripe (fonctions billing et stripe-webhook), jamais par l'appli.
import { handler, json, HttpError } from '../_shared/http.ts';
import { requireMerchant } from '../_shared/db.ts';
import { isLive } from '../_shared/billing.ts';
import { findReferrer, myCode } from '../_shared/referralServer.ts';
import { priceWithReferrals, referralsUntilFree } from '../_shared/referral.ts';

Deno.serve(handler(async (req) => {
  const { db, business } = await requireMerchant(req);
  const body = await req.json().catch(() => ({}));

  if (body.action === 'mine') {
    const code = await myCode(db, business);
    const { data: rows } = await db.from('referrals')
      .select('status, created_at, activated_at, referee:businesses!referrals_referee_business_id_fkey(business_name)')
      .eq('referrer_business_id', business.id).neq('status', 'blocked').order('created_at', { ascending: false });
    const referrals = (rows ?? []).map((r) => ({
      name: (r.referee as unknown as { business_name?: string } | null)?.business_name ?? 'Un commerçant',
      status: r.status as 'pending' | 'active' | 'ended',
      since: (r.activated_at ?? r.created_at) as string,
    }));
    const paying = referrals.filter((r) => r.status === 'active').length;
    const { data: sub } = await db.from('subscriptions').select('plan, status, stripe_subscription_id').eq('business_id', business.id).maybeSingle();
    const subscribed = Boolean(sub?.stripe_subscription_id && isLive(sub.status));
    const planId = subscribed ? sub!.plan : 'annual';
    const { data: plan } = await db.from('plans').select('monthly_price_cents').eq('id', planId).maybeSingle();
    const priceCents = plan?.monthly_price_cents ?? 2900;
    return json({
      code, referrals, paying, subscribed, priceCents,
      discountedCents: priceWithReferrals(priceCents, paying),
      untilFree: referralsUntilFree(priceCents, paying),
    });
  }

  if (body.action === 'check') {
    const { referrerName } = await findReferrer(db, business, body.code);
    return json({ ok: true, referrerName });
  }

  throw new HttpError(400, 'bad_action', 'Action inconnue.');
}));
