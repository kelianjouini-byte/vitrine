/**
 * Offres Vitrine, côté appli (affichage). Le montant réellement prélevé vient du serveur (table plans).
 * Décision de Kelian (5 nov. 2026) : 1er mois offert, puis Mensuel 39 € ou Annuel 29 € par mois (engagement 1 an, payé chaque mois).
 */
import type { PlanId } from '../../supabase/functions/_shared/billing';

export type { PlanId };
/** Même règle que le serveur (« abonnement en cours »). */
export { isLive as isLiveStatus } from '../../supabase/functions/_shared/billing';

export interface Offer {
  id: PlanId;
  name: string;
  priceCents: number;
  commitmentMonths: number;
}

export const OFFERS: Offer[] = [
  { id: 'monthly', name: 'Mensuel', priceCents: 3900, commitmentMonths: 0 },
  { id: 'annual', name: 'Annuel', priceCents: 2900, commitmentMonths: 12 },
];

export interface BillingStatus {
  /** false : le paiement en ligne n'est pas encore activé sur le serveur. */
  configured: boolean;
  trialEndsAt: string;
  plans: { id: PlanId; name: string; monthly_price_cents: number; commitment_months: number }[];
  subscription: null | {
    plan: PlanId | string;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    trialEnd: string | null;
    commitmentEndsAt: string | null;
  };
}

/** Offres à afficher : celles du serveur si on les a, sinon celles de l'appli. */
export function offersFrom(status: BillingStatus | null): Offer[] {
  if (!status?.plans.length) return OFFERS;
  return OFFERS.map((o) => {
    const p = status.plans.find((x) => x.id === o.id);
    return p ? { ...o, name: p.name, priceCents: p.monthly_price_cents, commitmentMonths: p.commitment_months } : o;
  });
}

export function euros(cents: number): string {
  return cents % 100 === 0 ? `${cents / 100} €` : `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/** Économie sur un an de l'offre Annuel par rapport au Mensuel. */
export function yearlySaving(offers: Offer[]): number {
  const m = offers.find((o) => o.id === 'monthly')!;
  const a = offers.find((o) => o.id === 'annual')!;
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
  const name = offer ? `${offer.name}, ${euros(offer.priceCents)} par mois` : 'Vitrine';
  const next = s.currentPeriodEnd ? frenchDate(s.currentPeriodEnd) : null;
  if (s.status === 'trialing') {
    return { tone: 'green', title: `Offre ${name}`, text: `Votre mois offert continue. 1er paiement le ${next ?? frenchDate(s.trialEnd ?? new Date().toISOString())}.` };
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
