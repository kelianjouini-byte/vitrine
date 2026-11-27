/**
 * « Est-ce votre boutique ? » : dès que le nom et le code postal (ou la ville) sont écrits,
 * Vitrine cherche la boutique dans l'annuaire public des entreprises et propose les
 * établissements qui correspondent. Le commerçant touche la sienne : ville, code postal
 * et métier se remplissent tout seuls. Rien trouvé, pas de réseau : il continue à la main.
 * Ne bloque jamais l'inscription.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CheckIcon, StoreIcon } from './icons';
import { colors, fonts, glass, radius } from '../lib/theme';
import { findShops } from '../lib/api';
import { guessTrade } from '../lib/trades';
import type { ShopMatch } from '../lib/shopLookup';

type State = { key: string; status: 'searching' | 'done' | 'error'; results: ShopMatch[] };

export function ShopFinder({ name, postalCode, city, picked, onPick, onUnpick }: {
  name?: string;
  postalCode?: string;
  city?: string;
  /** La boutique choisie dans la liste (affichée en vert). */
  picked: ShopMatch | null;
  onPick: (shop: ShopMatch) => void;
  onUnpick: () => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [hidden, setHidden] = useState(false);
  const lastKey = useRef('');

  const n = name?.trim() ?? '';
  const cp = postalCode?.trim() ?? '';
  const c = city?.trim() ?? '';
  const ready = n.length >= 2 && (/^\d{5}$/.test(cp) || c.length >= 2);
  const key = ready ? `${n}|${/^\d{5}$/.test(cp) ? cp : c}`.toLowerCase() : '';

  useEffect(() => {
    // Boutique déjà choisie (la ville et le code postal viennent d'elle) : on ne relance pas.
    if (picked || !key || key === lastKey.current) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      lastKey.current = key;
      setHidden(false);
      setState({ key, status: 'searching', results: [] });
      try {
        const results = await findShops({ name: n, postalCode: cp, city: c }, ctrl.signal);
        setState({ key, status: 'done', results });
      } catch {
        if (!ctrl.signal.aborted) setState({ key, status: 'error', results: [] });
      }
    }, 700);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [key, picked]);

  if (picked) {
    const trade = guessTrade(picked.names, picked.naf);
    return (
      <View style={{ gap: 10, backgroundColor: 'rgba(220,239,227,0.85)', borderRadius: radius.md, padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
            <CheckIcon size={18} color={colors.white} />
          </View>
          <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: colors.text, fontFamily: fonts.body }}>Boutique trouvée</Text>
        </View>
        <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, fontFamily: fonts.body }}>{picked.name}</Text>
        <Text style={{ fontSize: 15, color: colors.textSoft, fontFamily: fonts.body }}>{picked.address}</Text>
        <Text style={{ fontSize: 15, color: colors.textSoft, fontFamily: fonts.body }}>
          {trade ? 'Ville, code postal et métier remplis. Vérifiez-les ci-dessous.' : 'Ville et code postal remplis. Choisissez votre métier ci-dessous.'}
        </Text>
        <Pressable onPress={onUnpick} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>Ce n'est pas la bonne</Text>
        </Pressable>
      </View>
    );
  }

  if (!state || state.key !== key || hidden) return null;

  if (state.status === 'searching') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
        <ActivityIndicator color={colors.green} />
        <Text style={{ color: colors.textSoft, fontSize: 15, fontFamily: fonts.body }}>Vitrine cherche votre boutique…</Text>
      </View>
    );
  }

  if (state.results.length === 0) {
    return (
      <Text style={{ color: colors.textSoft, fontSize: 15, fontFamily: fonts.body }}>
        {state.status === 'error'
          ? 'Recherche impossible pour le moment. Pas grave : remplissez simplement ci-dessous.'
          : 'Votre boutique n\'a pas été trouvée. Pas grave : remplissez simplement ci-dessous.'}
      </Text>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text, fontFamily: fonts.body }}>Est-ce votre boutique ?</Text>
      {state.results.map((s) => {
        const trade = guessTrade(s.names, s.naf);
        return (
          <Pressable key={s.siret} onPress={() => onPick(s)} accessibilityRole="button" accessibilityLabel={`${s.name}, ${s.address}`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: glass.edge, backgroundColor: pressed ? colors.greenSoft : glass.bg })}>
            <StoreIcon size={22} color={colors.green} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 17, fontWeight: '600', color: colors.text, fontFamily: fonts.body }}>{s.name}</Text>
              <Text style={{ fontSize: 14, color: colors.textSoft, fontFamily: fonts.body }}>{s.address}</Text>
              {trade ? <Text style={{ fontSize: 14, color: colors.green, fontWeight: '600', fontFamily: fonts.body }}>{trade.label}</Text> : null}
            </View>
          </Pressable>
        );
      })}
      <Pressable onPress={() => setHidden(true)} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>Ma boutique n'est pas dans la liste</Text>
      </Pressable>
    </View>
  );
}
