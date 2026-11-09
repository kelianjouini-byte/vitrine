/**
 * Parrainage, côté appli : le message à envoyer, le lien, la carte à imprimer.
 * Les règles (montants, forme du code) sont partagées avec le serveur (supabase/functions/_shared/referral.ts).
 */
import { load, save } from './storage';

export { printableCards, qrSvg, referralLink, shareMessage } from './referralCard';

export {
  normalizeCode, looksLikeCode, priceWithReferrals, referralsUntilFree,
  REFEREE_DISCOUNT_CENTS, REFEREE_DISCOUNT_MONTHS, REFERRER_CREDIT_CENTS,
} from '../../supabase/functions/_shared/referral';

export interface ReferralInfo {
  code: string;
  referrals: { name: string; status: 'pending' | 'active' | 'ended'; since: string }[];
  /** Filleuls qui paient : 10 € de moins chacun. */
  paying: number;
  /** Le commerçant a lui-même un abonnement payant (sinon sa réduction démarrera quand il s'abonnera). */
  subscribed: boolean;
  priceCents: number;
  discountedCents: number;
  untilFree: number;
}

/** Code reçu par un lien de parrainage, gardé sur l'appareil jusqu'au paiement. */
export const savePendingCode = (code: string) => save('referralCode', code);
export const loadPendingCode = () => load<string>('referralCode', '');

/** Code dans l'adresse (« …/app/?parrain=FLEURS-7K4Q9 ») : renvoyé puis retiré de l'adresse. Version web seulement. */
export function codeFromUrl(): string | null {
  if (typeof window === 'undefined' || !window.location?.search) return null;
  const params = new URLSearchParams(window.location.search);
  const code = params.get('parrain');
  if (!code) return null;
  params.delete('parrain');
  const rest = params.toString();
  window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
  return code;
}
