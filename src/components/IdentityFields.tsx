import React from 'react';
import { View } from 'react-native';
import { Field } from './ui';
import type { Business } from '../lib/types';

export type Identity = Pick<Business, 'specialties' | 'strengths' | 'audience' | 'description'>;

/**
 * La « carte d'identité » de la boutique : ce que l'IA doit savoir pour écrire et proposer des idées
 * qui lui ressemblent. Utilisée à l'inscription et dans Réglages.
 */
export function IdentityFields({ value, onChange, foundOnline }: { value: Identity; onChange: (v: Identity) => void; foundOnline?: boolean }) {
  const set = (k: keyof Identity) => (v: string) => onChange({ ...value, [k]: v });
  const hint = foundOnline ? 'Trouvé sur internet : vérifiez et corrigez si besoin.' : undefined;
  return (
    <View style={{ gap: 16 }}>
      <Field label="Vos produits" value={value.specialties} onChangeText={set('specialties')} placeholder="Ex. : bouquets de saison, plantes" hint={value.specialties ? hint : undefined} multiline maxLength={500} />
      <Field label="Ce qui rend votre boutique unique" value={value.strengths} onChangeText={set('strengths')} placeholder="Ex. : fait maison, 3e génération" hint={value.strengths ? hint : undefined} multiline maxLength={500} />
      <Field label="Vos clients" value={value.audience} onChangeText={set('audience')} placeholder="Ex. : familles du quartier" hint={value.audience ? hint : undefined} multiline maxLength={300} />
      <Field label="Votre boutique en quelques mots (facultatif)" value={value.description} onChangeText={set('description')} placeholder="Ex. : fleuriste de quartier depuis 1998" multiline maxLength={1000} />
    </View>
  );
}
