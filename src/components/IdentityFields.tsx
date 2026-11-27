import React from 'react';
import { Text, View } from 'react-native';
import { Chip, Field } from './ui';
import { colors, fonts } from '../lib/theme';
import type { Business, EmployeeCount } from '../lib/types';

export type Identity = Pick<Business, 'specialties' | 'strengths' | 'audience' | 'description' | 'employeeCount'>;

export const EMPLOYEE_COUNTS: { id: EmployeeCount; label: string }[] = [
  { id: 'seul', label: 'Moi seul(e)' },
  { id: '2-5', label: '2 à 5' },
  { id: '6-10', label: '6 à 10' },
  { id: '11+', label: 'Plus de 10' },
];

/**
 * La « carte d'identité » de la boutique : ce que l'IA doit savoir pour écrire et proposer des idées
 * qui lui ressemblent. Utilisée à l'inscription et dans Réglages.
 */
export function IdentityFields({ value, onChange, foundOnline }: { value: Identity; onChange: (v: Identity) => void; foundOnline?: boolean }) {
  const set = (k: Exclude<keyof Identity, 'employeeCount'>) => (v: string) => onChange({ ...value, [k]: v });
  const hint = foundOnline ? 'Trouvé sur internet : vérifiez et corrigez si besoin.' : undefined;
  return (
    <View style={{ gap: 16 }}>
      <Field label="Vos produits" value={value.specialties} onChangeText={set('specialties')} placeholder="Ex. : bouquets de saison, plantes" hint={value.specialties ? hint : undefined} multiline maxLength={500} />
      <Field label="Ce qui rend votre boutique unique" value={value.strengths} onChangeText={set('strengths')} placeholder="Ex. : fait maison, 3e génération" hint={value.strengths ? hint : undefined} multiline maxLength={500} />
      <Field label="Vos clients" value={value.audience} onChangeText={set('audience')} placeholder="Ex. : familles du quartier" hint={value.audience ? hint : undefined} multiline maxLength={300} />
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, fontFamily: fonts.body }}>Combien êtes-vous à travailler dans la boutique ?</Text>
        <Text style={{ fontSize: 14, color: colors.textSoft, fontFamily: fonts.body }}>Vous compris.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {EMPLOYEE_COUNTS.map((c) => (
            <Chip key={c.id} label={c.label} selected={value.employeeCount === c.id} onPress={() => onChange({ ...value, employeeCount: value.employeeCount === c.id ? undefined : c.id })} />
          ))}
        </View>
      </View>
      <Field label="Votre boutique en quelques mots (facultatif)" value={value.description} onChangeText={set('description')} placeholder="Ex. : fleuriste de quartier depuis 1998" multiline maxLength={1000} />
    </View>
  );
}
