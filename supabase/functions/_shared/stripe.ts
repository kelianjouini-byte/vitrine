// Appels à l'API Stripe (sans SDK : simple fetch). La clé secrète reste sur le serveur.
import { env, HttpError } from './http.ts';
import { formEncode, type PlanId } from './billing.ts';

export function stripeConfigured(): boolean {
  return Boolean(env('STRIPE_SECRET_KEY'));
}

export async function stripe<T = Record<string, unknown>>(method: 'GET' | 'POST' | 'DELETE', path: string, params: Record<string, unknown> = {}): Promise<T> {
  const key = env('STRIPE_SECRET_KEY');
  if (!key) throw new HttpError(503, 'stripe_not_configured', "Le paiement en ligne n'est pas encore activé.");
  const query = formEncode(params);
  const url = `https://api.stripe.com/v1/${path}${method !== 'POST' && query ? `?${query}` : ''}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'POST' ? query : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    console.error('[vitrine] Stripe', path, res.status, err?.code ?? '', err?.message ?? '');
    throw new HttpError(502, err?.code === 'resource_already_exists' ? 'exists' : 'stripe_error', 'Le paiement ne répond pas. Réessayez dans un instant.');
  }
  return data as T;
}

const LOOKUP: Record<PlanId, string> = { monthly: 'vitrine_mensuel', annual: 'vitrine_annuel', founder: 'vitrine_fondateur' };
const NICKNAME: Record<PlanId, string> = {
  monthly: 'Mensuel, sans engagement', annual: 'Annuel, engagement 1 an (payé chaque mois)', founder: 'Offre fondateur, sans engagement',
};

/**
 * Prix Stripe de l'offre. Créé automatiquement la 1re fois (produit « Vitrine » + prix mensuel),
 * pour que Kelian n'ait rien à recopier depuis Stripe. Le montant vient de la table plans.
 */
export async function priceFor(plan: PlanId, amountCents: number): Promise<string> {
  const found = await stripe<{ data: { id: string; unit_amount: number }[] }>('GET', 'prices', { lookup_keys: [LOOKUP[plan]], active: 'true' });
  const same = found.data.find((p) => p.unit_amount === amountCents);
  if (same) return same.id;
  try {
    await stripe('POST', 'products', { id: 'vitrine', name: 'Vitrine', description: 'Vos publications Instagram et Facebook écrites et publiées pour vous.' });
  } catch (e) {
    if (!(e instanceof HttpError && e.code === 'exists')) throw e;
  }
  // transfer_lookup_key : si le montant a changé dans la table plans, le nouveau prix remplace l'ancien.
  const price = await stripe<{ id: string }>('POST', 'prices', {
    product: 'vitrine', currency: 'eur', unit_amount: amountCents, recurring: { interval: 'month' },
    lookup_key: LOOKUP[plan], transfer_lookup_key: 'true', nickname: NICKNAME[plan],
  });
  return price.id;
}

const EXTRA_LOOKUP: Record<PlanId, string> = { monthly: 'vitrine_boutique_mensuel', annual: 'vitrine_boutique_annuel', founder: 'vitrine_boutique_fondateur' };
const EXTRA_NICKNAME: Record<PlanId, string> = { monthly: 'Boutique en plus (Mensuel)', annual: 'Boutique en plus (Annuel)', founder: 'Boutique en plus (Fondateur)' };

/** Prix Stripe d'une boutique en plus (19 € en mensuel, 15 € en annuel et en fondateur). Créé automatiquement la 1re fois. */
export async function extraShopPriceFor(plan: PlanId, amountCents: number): Promise<string> {
  const found = await stripe<{ data: { id: string; unit_amount: number }[] }>('GET', 'prices', { lookup_keys: [EXTRA_LOOKUP[plan]], active: 'true' });
  const same = found.data.find((p) => p.unit_amount === amountCents);
  if (same) return same.id;
  try {
    await stripe('POST', 'products', { id: 'vitrine_boutique', name: 'Vitrine : boutique en plus', description: 'Une boutique de plus dans votre compte Vitrine.' });
  } catch (e) {
    if (!(e instanceof HttpError && e.code === 'exists')) throw e;
  }
  const price = await stripe<{ id: string }>('POST', 'prices', {
    product: 'vitrine_boutique', currency: 'eur', unit_amount: amountCents, recurring: { interval: 'month' },
    lookup_key: EXTRA_LOOKUP[plan], transfer_lookup_key: 'true', nickname: EXTRA_NICKNAME[plan],
  });
  return price.id;
}

/**
 * Réglages du portail client. « locked » : pendant l'engagement d'un an, le commerçant peut changer sa carte
 * et voir ses factures, mais pas résilier en un clic. « free » : il peut aussi résilier (fin à la date du prochain paiement).
 */
export async function portalConfiguration(kind: 'free' | 'locked'): Promise<string> {
  const list = await stripe<{ data: { id: string; metadata?: Record<string, string> }[] }>('GET', 'billing_portal/configurations', { active: 'true', limit: 100 });
  const found = list.data.find((c) => c.metadata?.vitrine === kind);
  if (found) return found.id;
  const site = env('PUBLIC_SITE_URL') ?? 'https://vitrineappli.fr';
  const conf = await stripe<{ id: string }>('POST', 'billing_portal/configurations', {
    business_profile: { headline: 'Vitrine : mon abonnement', privacy_policy_url: `${site}/confidentialite/`, terms_of_service_url: `${site}/conditions/` },
    features: {
      invoice_history: { enabled: 'true' },
      payment_method_update: { enabled: 'true' },
      customer_update: { enabled: 'false' },
      subscription_cancel: kind === 'free' ? { enabled: 'true', mode: 'at_period_end' } : { enabled: 'false' },
    },
    metadata: { vitrine: kind },
  });
  return conf.id;
}
