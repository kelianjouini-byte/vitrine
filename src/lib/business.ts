import type { Business, Tone } from './types';
import { tradeById } from './trades';

export const TONES: { id: Tone; label: string }[] = [
  { id: 'chaleureux', label: 'Chaleureux' },
  { id: 'elegant', label: 'Élégant' },
  { id: 'dynamique', label: 'Dynamique' },
  { id: 'humoristique', label: 'Avec humour' },
  { id: 'premium', label: 'Haut de gamme' },
  { id: 'familial', label: 'Familial' },
  { id: 'traditionnel', label: 'Traditionnel' },
];

/** Le métier à afficher : celui que le commerçant a écrit, sinon celui du catalogue. */
export function tradeLabel(b: Pick<Business, 'businessType' | 'trade'>): string {
  return b.trade?.trim() || tradeById(b.businessType)?.label || 'Commerce';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'V';
}
