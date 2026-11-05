// Fin de l'essai gratuit : les actions payantes (écrire un texte, publier) sont refusées
// tant qu'il n'y a pas d'abonnement. Seulement quand le paiement est activé (sinon le commerçant ne pourrait pas payer).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { HttpError } from './http.ts';
import { accessState } from './billing.ts';
import { stripeConfigured } from './stripe.ts';

export async function requireAccess(db: SupabaseClient, business: { id: string; created_at: string }) {
  if (!stripeConfigured()) return;
  const { data: sub } = await db.from('subscriptions').select('status, stripe_subscription_id').eq('business_id', business.id).maybeSingle();
  if (accessState(business.created_at, sub) === 'expired') {
    throw new HttpError(402, 'trial_over', 'Votre essai gratuit est terminé. Choisissez une offre pour continuer.');
  }
}
