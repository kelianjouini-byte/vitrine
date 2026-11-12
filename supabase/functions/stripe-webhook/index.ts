// Webhook Stripe : Stripe prévient Vitrine quand un abonnement est créé, payé, en retard ou résilié.
// Appelé par Stripe (pas par l'app) : pas de jeton utilisateur, on vérifie la signature Stripe-Signature.
// Événements à cocher dans Stripe : checkout.session.completed, customer.subscription.created,
// customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed, invoice.paid (parrainage).
import { handler, json, HttpError, env } from '../_shared/http.ts';
import { admin } from '../_shared/db.ts';
import { subscriptionRow, verifyStripeSignature, type StripeSubscription } from '../_shared/billing.ts';
import { stripe } from '../_shared/stripe.ts';
import { endReferral, recordReferral, rewardReferrer } from '../_shared/referralServer.ts';

async function giveFounderNumber(db: ReturnType<typeof admin>, businessId: string) {
  const { data: mine } = await db.from('subscriptions').select('founder_number').eq('business_id', businessId).maybeSingle();
  if (mine?.founder_number != null) return;
  const { data: last } = await db.from('subscriptions').select('founder_number').not('founder_number', 'is', null)
    .order('founder_number', { ascending: false }).limit(1).maybeSingle();
  await db.from('subscriptions').update({ founder_number: (last?.founder_number ?? 0) + 1 }).eq('business_id', businessId).is('founder_number', null);
}

Deno.serve(handler(async (req) => {
  const secret = env('STRIPE_WEBHOOK_SECRET');
  if (!secret) throw new HttpError(503, 'stripe_not_configured', 'Webhook non configuré.');
  const body = await req.text();
  if (!(await verifyStripeSignature(body, req.headers.get('stripe-signature'), secret))) {
    throw new HttpError(400, 'bad_signature', 'Signature invalide.');
  }
  const event = JSON.parse(body) as { id: string; type: string; data: { object: Record<string, unknown> } };
  const db = admin();

  // Idempotence : un même événement n'est traité qu'une fois (Stripe peut le renvoyer).
  const { error: dup } = await db.from('stripe_events').insert({ id: event.id });
  if (dup) return json({ received: true, duplicate: true });

  try {
    let subscriptionId: string | undefined;
    const obj = event.data.object;
    if (event.type === 'checkout.session.completed') subscriptionId = obj.subscription as string | undefined;
    else if (event.type.startsWith('customer.subscription.')) subscriptionId = obj.id as string;
    else if (event.type === 'invoice.payment_failed' || event.type === 'invoice.paid') {
      // Selon la version de l'API, l'abonnement est à la racine ou dans parent.subscription_details.
      const parent = obj.parent as { subscription_details?: { subscription?: string } } | undefined;
      subscriptionId = (obj.subscription as string | undefined) ?? parent?.subscription_details?.subscription;
    }

    if (subscriptionId) {
      // On relit l'abonnement chez Stripe : l'état le plus récent fait foi, quel que soit l'ordre d'arrivée des événements.
      const sub = await stripe<StripeSubscription>('GET', `subscriptions/${subscriptionId}`);
      const businessId = sub.metadata?.business_id;
      if (businessId) {
        const { error } = await db.from('subscriptions').upsert({ business_id: businessId, ...subscriptionRow(sub) }, { onConflict: 'business_id' });
        if (error) throw new Error(error.message);
        console.log('[vitrine] abonnement', businessId, sub.status, event.type);

        // Offre fondateur : la boutique reçoit son numéro (1, 2, 3…) une seule fois, à sa 1re inscription.
        if (sub.metadata?.plan === 'founder') await giveFounderNumber(db, businessId);

        // Parrainage : le code tapé au paiement est rangé dans l'abonnement (metadata).
        const referrerId = sub.metadata?.referrer_business_id;
        if (referrerId) await recordReferral(db, businessId, referrerId, sub.metadata?.referral_code ?? '', sub.id);
        if (sub.status === 'canceled' || sub.status === 'incomplete_expired') await endReferral(db, businessId);
        // Le filleul a vraiment payé (pas la facture à 0 € du début de l'essai) : le parrain gagne 10 €.
        if (event.type === 'invoice.paid' && Number(obj.amount_paid ?? 0) > 0 && typeof obj.id === 'string') {
          await rewardReferrer(db, businessId, obj.id);
        }
      }
    }
    return json({ received: true });
  } catch (e) {
    // Échec : on oublie l'événement pour que Stripe puisse le renvoyer.
    await db.from('stripe_events').delete().eq('id', event.id);
    throw e;
  }
}));
