/**
 * Règles d'abonnement de Vitrine, sans dépendance (testées avec node --test).
 * 1er mois offert, puis « Mensuel » (sans engagement) ou « Annuel » (engagement 12 mois, payé chaque mois).
 */

export type PlanId = 'monthly' | 'annual';
export const PLAN_IDS: PlanId[] = ['monthly', 'annual'];
export const TRIAL_DAYS = 30;
const DAY = 86_400_000;

export function isPlanId(v: unknown): v is PlanId {
  return v === 'monthly' || v === 'annual';
}

/** Fin du mois offert : 30 jours après la création de la boutique. */
export function trialEndsAt(businessCreatedAt: string): Date {
  return new Date(new Date(businessCreatedAt).getTime() + TRIAL_DAYS * DAY);
}

/**
 * Date de fin d'essai à donner à Stripe (en secondes), ou null si le mois offert est déjà passé.
 * Stripe demande une fin d'essai à au moins 48 h : dans ce cas, on arrondit en faveur du commerçant.
 */
export function stripeTrialEnd(businessCreatedAt: string, now = new Date()): number | null {
  const end = trialEndsAt(businessCreatedAt).getTime();
  if (end <= now.getTime()) return null;
  const min = now.getTime() + 2 * DAY + 10 * 60_000;
  return Math.floor(Math.max(end, min) / 1000);
}

export function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + n);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

/** Un abonnement Stripe, réduit aux champs utiles (les versions récentes de l'API mettent les dates de période dans items). */
export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  start_date?: number;
  trial_end?: number | null;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: { current_period_end?: number }[] };
}

const iso = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

/** Ligne de la table subscriptions à partir d'un abonnement Stripe. */
export function subscriptionRow(sub: StripeSubscription) {
  const plan: PlanId = sub.metadata?.plan === 'annual' ? 'annual' : 'monthly';
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  // L'engagement d'un an compte 12 mois payés : il commence à la fin du mois offert.
  const start = sub.trial_end ?? sub.start_date;
  return {
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
    plan,
    status: sub.status,
    current_period_end: iso(periodEnd),
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    trial_end: iso(sub.trial_end),
    commitment_ends_at: plan === 'annual' && start ? addMonths(new Date(start * 1000), 12).toISOString() : null,
  };
}

/** Un abonnement en cours (on ne peut pas en prendre un 2e). */
export function isLive(status: string | null | undefined): boolean {
  return status === 'trialing' || status === 'active' || status === 'past_due' || status === 'unpaid' || status === 'paused';
}

/** Encodage « formulaire » de l'API Stripe : {a:{b:1}, c:[x]} -> a[b]=1&c[0]=x */
export function formEncode(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') {
      const inner = formEncode(Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [String(i), x])) : (v as Record<string, unknown>), key);
      if (inner) parts.push(inner);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.join('&');
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Vérifie l'en-tête Stripe-Signature (« t=…,v1=… ») d'un webhook. Refuse au-delà de 5 minutes. */
export async function verifyStripeSignature(body: string, header: string | null, secret: string, nowSec = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (!header) return false;
  const fields = header.split(',').map((p) => p.trim().split('='));
  const t = Number(fields.find(([k]) => k === 't')?.[1]);
  const sigs = fields.filter(([k]) => k === 'v1').map(([, v]) => v ?? '');
  if (!t || !sigs.length || Math.abs(nowSec - t) > 300) return false;
  const expected = await hmacHex(secret, `${t}.${body}`);
  return sigs.some((s) => safeEqual(s, expected));
}

/** Pour les tests : fabrique un en-tête Stripe-Signature valide. */
export async function signForTest(body: string, secret: string, t: number): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`;
}
