/**
 * Offres Vitrine, côté appli (affichage). Le montant réellement prélevé vient du serveur (table plans).
 * Décision de Kelian (5 nov. 2026) : 15 jours offerts (sans carte), puis Mensuel 39 € ou Annuel 29 € par mois (engagement 1 an, payé chaque mois).
 */
import type { Access, FounderOffer, PlanId } from '../../supabase/functions/_shared/billing';

export type { Access, FounderOffer, PlanId };
export { TRIAL_DAYS } from '../../supabase/functions/_shared/billing';
export { TRIAL_REPORT_DAYS_BEFORE, trialReminders, trialSummary, type TrialSummary } from './report';
/** Même règle que le serveur (« abonnement en cours »). */
export { isLive as isLiveStatus } from '../../supabase/functions/_shared/billing';

export interface Offer {
  id: PlanId;
  name: string;
  priceCents: number;
  commitmentMonths: number;
  /** Prix d'une boutique en plus (19 € en mensuel, 15 € en annuel). */
  extraShopCents: number;
}

export const OFFERS: Offer[] = [
  { id: 'monthly', name: 'Mensuel', priceCents: 3900, commitmentMonths: 0, extraShopCents: 1900 },
  { id: 'annual', name: 'Annuel', priceCents: 2900, commitmentMonths: 12, extraShopCents: 1500 },
  // Offre fondateur (12 nov. 2026) : 29 € sans engagement, réservée aux premières boutiques. Affichée seulement s'il reste des places.
  { id: 'founder', name: 'Fondateur', priceCents: 2900, commitmentMonths: 0, extraShopCents: 1500 },
];

/** Nom affiché d'une offre : « Offre fondateur », « Mensuel », « Annuel ». */
export function offerTitle(o: Offer): string {
  return o.id === 'founder' ? 'Offre fondateur' : o.name;
}

/**
 * Offres à proposer au commerçant. Tant qu'il peut prendre l'offre fondateur, on montre seulement
 * Fondateur et Mensuel (l'Annuel serait au même prix, mais avec engagement). Sinon Mensuel et Annuel.
 */
export function offersToShow(offers: Offer[], founder: FounderOffer | null | undefined): Offer[] {
  const ids: PlanId[] = founder?.eligible ? ['founder', 'monthly'] : ['monthly', 'annual'];
  return ids.map((id) => offers.find((o) => o.id === id)!).filter(Boolean);
}

/** Phrase du compteur : « Plus que 9 places », « Plus qu'une place ». */
export function placesLeftText(left: number): string {
  return left === 1 ? "Plus qu'une place" : `Plus que ${left} places`;
}

export interface BillingStatus {
  /** false : le paiement en ligne n'est pas encore activé sur le serveur. */
  configured: boolean;
  /** Essai en cours, payé, offert, ou essai terminé. */
  access: Access;
  trialStartedAt: string;
  trialEndsAt: string;
  plans: { id: PlanId; name: string; monthly_price_cents: number; commitment_months: number; extra_shop_price_cents?: number }[];
  /** Boutiques de l'entreprise (la principale en premier). Vide pour un employé. */
  shops?: { id: string; name: string }[];
  /** Total par mois de l'abonnement en cours (1re boutique + boutiques en plus). */
  monthlyTotalCents?: number | null;
  role?: 'owner' | 'patron' | 'employe';
  /** Offre fondateur : places restantes et droit de la prendre (null pour un employé). */
  founder?: FounderOffer | null;
  subscription: null | {
    plan: PlanId | string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
    commitmentEndsAt: string | null;
    /** Numéro de boutique fondatrice (1, 2, 3…) pour l'offre fondateur. */
    founderNumber?: number | null;
  };
}

/** Offres à afficher : celles du serveur si on les a, sinon celles de l'appli. */
export function offersFrom(status: BillingStatus | null): Offer[] {
  if (!status?.plans.length) return OFFERS;
  return OFFERS.map((o) => {
    const p = status.plans.find((x) => x.id === o.id);
    return p ? { ...o, name: p.name, priceCents: p.monthly_price_cents, commitmentMonths: p.commitment_months, extraShopCents: p.extra_shop_price_cents || o.extraShopCents } : o;
  });
}

export function euros(cents: number): string {
  return cents % 100 === 0 ? `${cents / 100} €` : `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/** Économie sur un an de l'offre Annuel par rapport au Mensuel. */
export function yearlySaving(offers: Offer[]): number {
  const m = offers.find((o) => o.id === 'monthly');
  const a = offers.find((o) => o.id === 'annual');
  if (!m || !a) return 0;
  return (m.priceCents - a.priceCents) * 12;
}

export function frenchDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function daysLeft(iso: string, now = new Date()): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000));
}

/** Phrase simple qui dit où en est l'abonnement. */
export function statusText(s: NonNullable<BillingStatus['subscription']>, offers: Offer[] = OFFERS): { title: string; text: string; tone: 'green' | 'orange' | 'red' } {
  const offer = offers.find((o) => o.id === s.plan);
  const name = offer ? `${offer.id === 'founder' ? 'fondateur' : offer.name}, ${euros(offer.priceCents)} par mois` : 'Vitrine';
  const next = s.currentPeriodEnd ? frenchDate(s.currentPeriodEnd) : null;
  if (s.status === 'trialing') {
    return { tone: 'green', title: `Offre ${name}`, text: `Vos jours gratuits continuent. 1er paiement le ${next ?? frenchDate(s.trialEnd ?? new Date().toISOString())}.` };
  }
  if (s.status === 'active' && s.cancelAtPeriodEnd) {
    return { tone: 'orange', title: `Offre ${name}`, text: next ? `Résilié : votre abonnement s'arrête le ${next}.` : 'Résilié.' };
  }
  if (s.status === 'active') return { tone: 'green', title: `Offre ${name}`, text: next ? `Prochain paiement le ${next}.` : 'Abonnement en cours.' };
  if (s.status === 'past_due' || s.status === 'unpaid') {
    return { tone: 'red', title: 'Le dernier paiement n\'est pas passé', text: 'Touchez « Gérer mon paiement » pour changer de carte bancaire.' };
  }
  return { tone: 'orange', title: 'Abonnement terminé', text: 'Choisissez une offre pour continuer avec Vitrine.' };
}

/** L'appli est bloquée : essai terminé, pas d'abonnement, et le paiement est bien activé (sinon le commerçant ne pourrait pas payer). */
export function isBlocked(status: BillingStatus | null): boolean {
  return Boolean(status?.configured && status.access === 'expired');
}
