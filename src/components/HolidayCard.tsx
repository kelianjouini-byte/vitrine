import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Card, Field, Label, Title } from './ui';
import { colors, fonts, radius } from '../lib/theme';
import { dayLabel, holidayAnswer, holidayName } from '../lib/planning';
import type { CommercialEvent } from '../lib/events';
import type { Business } from '../lib/types';

/**
 * Affiche d'un jour férié : « Êtes-vous ouvert ce jour-là ? » Oui / Non (+ horaires facultatifs).
 * La réponse est gardée dans la boutique ; le planning en déduit le post qui prévient les clients.
 */
export function HolidayCard({ business: b, holiday: h, onSave, announceLabel }: {
  business: Business;
  holiday: CommercialEvent;
  onSave: (b: Business) => void;
  /** « mardi 10 novembre » : le jour où Vitrine conseille de prévenir les clients. */
  announceLabel?: string;
}) {
  const answer = holidayAnswer(b, h);
  const [hours, setHours] = useState(answer?.hours ?? '');
  const set = (open: boolean, hrs?: string) =>
    onSave({ ...b, holidays: { ...b.holidays, [h.id]: { open, hours: open ? (hrs ?? answer?.hours) : undefined } } });

  return (
    <Card style={{ gap: 12, backgroundColor: 'rgba(252,239,217,0.75)' }}>
      <Label>Jour férié</Label>
      <Title size={22}>{holidayName(h)}</Title>
      <Body soft size={14} style={{ marginTop: -6 }}>{dayLabel(h.date)}</Body>
      <Body style={{ fontWeight: '600' }}>Êtes-vous ouvert ce jour-là ?</Body>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Choice label="Oui, ouvert" selected={answer?.open === true} onPress={() => set(true)} />
        <Choice label="Non, fermé" selected={answer?.open === false} onPress={() => set(false)} />
      </View>
      {answer?.open && (
        <Field
          label="Vos horaires ce jour-là (facultatif)"
          hint="Repris tels quels dans le post. Vitrine n'invente jamais d'horaires."
          placeholder="Ex. : de 9 h à 13 h"
          value={hours}
          onChangeText={setHours}
          onBlur={() => set(true, hours.trim() || undefined)}
          maxLength={60}
        />
      )}
      {answer && announceLabel && (
        <Body soft size={14}>
          Vitrine vous conseille un post le {announceLabel} pour prévenir vos clients que vous êtes {answer.open ? 'ouvert' : 'fermé'}.
        </Body>
      )}
    </Card>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected }}
      style={({ pressed }) => ({ flex: 1, minHeight: 56, borderRadius: radius.md, borderWidth: 2, borderColor: selected ? colors.green : 'rgba(36,51,43,0.12)', backgroundColor: selected ? colors.greenSoft : 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
      <Text style={{ fontSize: 17, fontWeight: '700', color: selected ? colors.green : colors.text, fontFamily: fonts.body }}>{label}</Text>
    </Pressable>
  );
}
