import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accessState, addMonths, formEncode, isLive, signForTest, stripeTrialEnd, subscriptionRow, trialEndsAt, verifyStripeSignature,
} from '../supabase/functions/_shared/billing.ts';

test("l'essai gratuit dure 15 jours après la création de la boutique", () => {
  assert.equal(trialEndsAt('2026-11-01T10:00:00Z').toISOString(), '2026-11-16T10:00:00.000Z');
});

test("Stripe reçoit la fin de l'essai, sinon rien quand il est passé", () => {
  const now = new Date('2026-11-05T10:00:00Z');
  assert.equal(stripeTrialEnd('2026-11-01T10:00:00Z', now), Date.parse('2026-11-16T10:00:00Z') / 1000);
  assert.equal(stripeTrialEnd('2026-10-01T10:00:00Z', now), null);
  // Moins de 48 h restantes : on arrondit à 48 h (en faveur du commerçant).
  const almost = stripeTrialEnd('2026-10-22T09:00:00Z', now)!;
  assert.ok(almost * 1000 >= now.getTime() + 2 * 86_400_000);
});

test("accès : essai, terminé, payé, offert à la main", () => {
  const now = new Date('2026-11-20T10:00:00Z');
  assert.equal(accessState('2026-11-10T10:00:00Z', null, now), 'trial');
  assert.equal(accessState('2026-11-01T10:00:00Z', null, now), 'expired');
  // Ligne créée au moment du paiement mais pas encore d'abonnement Stripe : toujours bloqué.
  assert.equal(accessState('2026-11-01T10:00:00Z', { status: 'trialing', stripe_subscription_id: null }, now), 'expired');
  assert.equal(accessState('2026-11-01T10:00:00Z', { status: 'active', stripe_subscription_id: 'sub_1' }, now), 'paid');
  assert.equal(accessState('2026-11-01T10:00:00Z', { status: 'canceled', stripe_subscription_id: 'sub_1' }, now), 'expired');
  assert.equal(accessState('2026-11-01T10:00:00Z', { status: 'free' }, now), 'free');
});

test('ajouter 12 mois garde le jour, ou le dernier jour du mois', () => {
  assert.equal(addMonths(new Date('2026-12-01T10:00:00Z'), 12).toISOString(), '2027-12-01T10:00:00.000Z');
  assert.equal(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString(), '2026-02-28T00:00:00.000Z');
});

test("offre Annuel : l'engagement de 12 mois commence après le mois offert", () => {
  const row = subscriptionRow({
    id: 'sub_1', customer: 'cus_1', status: 'trialing', start_date: Date.parse('2026-11-05T10:00:00Z') / 1000,
    trial_end: Date.parse('2026-12-01T10:00:00Z') / 1000, metadata: { plan: 'annual', business_id: 'b' },
    items: { data: [{ current_period_end: Date.parse('2026-12-01T10:00:00Z') / 1000 }] },
  });
  assert.equal(row.plan, 'annual');
  assert.equal(row.commitment_ends_at, '2027-12-01T10:00:00.000Z');
  assert.equal(row.current_period_end, '2026-12-01T10:00:00.000Z');
});

test('offre Mensuel : pas d\'engagement', () => {
  const row = subscriptionRow({ id: 's', customer: 'c', status: 'active', cancel_at_period_end: true, metadata: { plan: 'monthly' } });
  assert.equal(row.plan, 'monthly');
  assert.equal(row.commitment_ends_at, null);
  assert.equal(row.cancel_at_period_end, true);
});

test('abonnement en cours ou terminé', () => {
  assert.ok(isLive('trialing') && isLive('active') && isLive('past_due'));
  assert.ok(!isLive('canceled') && !isLive('incomplete_expired') && !isLive(null));
});

test('encodage des paramètres Stripe', () => {
  assert.equal(
    decodeURIComponent(formEncode({ mode: 'subscription', line_items: [{ price: 'p', quantity: 1 }], x: undefined, m: { plan: 'annual' } })),
    'mode=subscription&line_items[0][price]=p&line_items[0][quantity]=1&m[plan]=annual',
  );
});

test('signature du webhook Stripe : bonne, fausse, trop ancienne', async () => {
  const body = '{"id":"evt_1"}';
  const t = 1_800_000_000;
  const header = await signForTest(body, 'whsec_test', t);
  assert.equal(await verifyStripeSignature(body, header, 'whsec_test', t + 10), true);
  assert.equal(await verifyStripeSignature(body + ' ', header, 'whsec_test', t + 10), false);
  assert.equal(await verifyStripeSignature(body, header, 'whsec_autre', t + 10), false);
  assert.equal(await verifyStripeSignature(body, header, 'whsec_test', t + 3600), false);
  assert.equal(await verifyStripeSignature(body, null, 'whsec_test', t), false);
});
