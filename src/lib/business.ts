import type { BusinessType, Tone } from './types';

export const BUSINESS_TYPES: { id: BusinessType; label: string; emoji: string }[] = [
  { id: 'fleuriste', label: 'Fleuriste', emoji: '💐' },
  { id: 'boulangerie', label: 'Boulangerie', emoji: '🥖' },
  { id: 'patisserie', label: 'Pâtisserie', emoji: '🍰' },
  { id: 'coiffure', label: 'Coiffure', emoji: '💇' },
  { id: 'beaute', label: 'Institut de beauté', emoji: '💅' },
  { id: 'restaurant', label: 'Restaurant', emoji: '🍽️' },
  { id: 'vetements', label: 'Vêtements', emoji: '👗' },
  { id: 'epicerie', label: 'Épicerie', emoji: '🧺' },
  { id: 'chocolatier', label: 'Chocolatier', emoji: '🍫' },
  { id: 'caviste', label: 'Caviste', emoji: '🍷' },
  { id: 'artisan', label: 'Artisan', emoji: '🛠️' },
  { id: 'autre', label: 'Autre commerce', emoji: '🏪' },
];

export const TONES: { id: Tone; label: string }[] = [
  { id: 'chaleureux', label: 'Chaleureux' },
  { id: 'elegant', label: 'Élégant' },
  { id: 'dynamique', label: 'Dynamique' },
  { id: 'humoristique', label: 'Avec humour' },
  { id: 'premium', label: 'Haut de gamme' },
  { id: 'familial', label: 'Familial' },
  { id: 'traditionnel', label: 'Traditionnel' },
];

export function businessTypeLabel(t: BusinessType): string {
  return BUSINESS_TYPES.find((b) => b.id === t)?.label ?? 'Commerce';
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-Z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || 'V';
}
