import type { Business, Tone } from './types';
import { tradeById } from './trades';

/** Les 7 tons. Premium est le ton par défaut (choix de Kelian, 3 nov. 2026). */
export const DEFAULT_TONE: Tone = 'premium';

export const TONES: { id: Tone; label: string }[] = [
  { id: 'premium', label: 'Premium' },
  { id: 'elegant', label: 'Élégant' },
  { id: 'chaleureux', label: 'Chaleureux' },
  { id: 'dynamique', label: 'Dynamique' },
  { id: 'humoristique', label: 'Touche d\'humour' },
  { id: 'familial', label: 'Familial' },
  { id: 'traditionnel', label: 'Traditionnel' },
];

/** Nom du ton à afficher (« Premium », « Élégant »...). */
export function toneLabel(t: Tone | undefined): string {
  return TONES.find((x) => x.id === t)?.label ?? 'Premium';
}

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
