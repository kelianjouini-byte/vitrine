/**
 * Choix du métier à l'inscription : une barre de recherche, les métiers les plus courants
 * proposés d'office, et la possibilité d'écrire un métier qui n'est pas dans la liste.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { Notice } from './ui';
import { PencilIcon, StoreIcon } from './icons';
import { colors, fonts, glass, radius } from '../lib/theme';
import { normalize, searchTrades, tradeById } from '../lib/trades';
import type { BusinessType } from '../lib/types';

export interface TradeValue {
  businessType?: BusinessType;
  trade?: string;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function TradePicker({ value, onChange, detecting, detectedFrom, error }: {
  value: TradeValue;
  onChange: (v: TradeValue) => void;
  /** L'IA cherche le métier sur internet. */
  detecting?: boolean;
  /** Le métier a été trouvé sur internet (affiche un message à vérifier). */
  detectedFrom?: boolean;
  error?: string;
}) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchTrades(query), [query]);
  const selectedLabel = value.trade || (value.businessType ? tradeById(value.businessType)?.label : undefined);
  const exact = results.some((t) => [t.label, ...t.synonyms].some((w) => normalize(w) === normalize(query)));

  if (selectedLabel) {
    return (
      <View style={{ gap: 10 }}>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, fontFamily: fonts.body }}>Votre métier</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(220,239,227,0.85)', borderRadius: radius.md, padding: 14 }}>
          <StoreIcon size={24} color={colors.green} />
          <Text style={{ flex: 1, fontSize: 18, fontWeight: '700', color: colors.text, fontFamily: fonts.body }}>{selectedLabel}</Text>
          <Pressable onPress={() => { setQuery(''); onChange({}); }} accessibilityRole="button" accessibilityLabel="Changer de métier" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}>
            <Text style={{ color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>Changer</Text>
          </Pressable>
        </View>
        {detectedFrom ? <Notice tone="green" title="Trouvé sur internet" text="Vérifiez que c'est bien votre métier. Sinon, touchez « Changer »." /> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, fontFamily: fonts.body }}>Votre métier</Text>
      {detecting ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={colors.green} />
          <Text style={{ color: colors.textSoft, fontSize: 15, fontFamily: fonts.body }}>Vitrine cherche votre boutique sur internet…</Text>
        </View>
      ) : null}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Ex. : fleuriste, coiffeur…"
        placeholderTextColor="#A3ABA5"
        accessibilityLabel="Rechercher votre métier"
        autoCorrect={false}
        style={{ minHeight: 54, borderRadius: 14, borderWidth: 1.5, borderColor: error ? colors.red : glass.line, backgroundColor: glass.bgStrong, paddingHorizontal: 16, fontSize: 17, color: colors.text, fontFamily: fonts.body }}
      />
      {!query ? <Text style={{ color: colors.textSoft, fontSize: 15, fontFamily: fonts.body }}>Les plus courants :</Text> : null}
      <View style={{ gap: 8 }}>
        {results.map((t) => (
          <Pressable key={t.id} onPress={() => onChange({ businessType: t.id, trade: t.label })} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: glass.edge, backgroundColor: pressed ? colors.greenSoft : glass.bg })}>
            <Text style={{ fontSize: 17, color: colors.text, fontFamily: fonts.body }}>{t.label}</Text>
          </Pressable>
        ))}
        {query.trim().length >= 3 && !exact ? (
          <Pressable onPress={() => onChange({ businessType: 'autre', trade: capitalize(query.trim()) })} accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.green, backgroundColor: pressed ? colors.greenSoft : colors.white })}>
            <PencilIcon size={20} color={colors.green} />
            <Text style={{ flex: 1, fontSize: 17, color: colors.green, fontWeight: '600', fontFamily: fonts.body }}>Mon métier : « {capitalize(query.trim())} »</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={{ color: colors.red, fontSize: 15 }}>{error}</Text> : null}
    </View>
  );
}
