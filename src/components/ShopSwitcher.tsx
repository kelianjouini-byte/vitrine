import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Body, Chevron, IconTile } from './ui';
import { CheckIcon, ChevronDownIcon, PlusIcon, StoreIcon } from './icons';
import { colors, fonts, glassSurface } from '../lib/theme';
import { useApp } from '../lib/store';
import { shopLabel } from '../lib/team';

/**
 * Bouton en haut de l'accueil : la boutique ouverte. On appuie dessus pour en changer, ou en ajouter une (patron).
 * N'apparaît que s'il y a plusieurs boutiques (ou un patron qui peut en ajouter, via Réglages).
 */
export function ShopSwitcher() {
  const { business, team, switchShop, isPatron, go } = useApp();
  const [open, setOpen] = useState(false);
  const shops = team?.shops ?? [];
  if (shops.length < 2 || !business) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Boutique ouverte : ${shopLabel(business, true)}. Changer de boutique`}
        style={({ pressed }) => ({ ...glassSurface, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, minHeight: 44, opacity: pressed ? 0.85 : 1 })}
      >
        <StoreIcon size={20} color={colors.greenDark} />
        <Text numberOfLines={1} style={{ color: colors.greenDark, fontWeight: '600', fontSize: 15, fontFamily: fonts.body, maxWidth: 240 }}>{shopLabel(business, true)}</Text>
        <ChevronDownIcon size={18} color={colors.greenDark} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} accessibilityLabel="Fermer" style={{ flex: 1, backgroundColor: 'rgba(36,51,43,0.35)', justifyContent: 'flex-end' }}>
          <Pressable onPress={() => {}} style={{ margin: 12, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.97)', padding: 20, paddingTop: 14, width: '100%', maxWidth: 536, alignSelf: 'center' }}>
            <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(36,51,43,0.18)', alignSelf: 'center', marginBottom: 14 }} />
            <Text style={{ fontFamily: fonts.title, fontSize: 21, fontWeight: '600', color: colors.text, marginBottom: 6 }}>Mes boutiques</Text>
            {shops.map((s) => {
              const current = s.id === business.id;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => { setOpen(false); if (!current && s.id) switchShop(s.id); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: current }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: 'rgba(36,51,43,0.08)' }}
                >
                  <IconTile size={42}><StoreIcon size={20} color={colors.green} /></IconTile>
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: current ? '700' : '500' }}>{s.businessName}</Body>
                    <Body soft size={14}>{s.city}</Body>
                  </View>
                  {current ? <CheckIcon size={22} color={colors.green} /> : <Chevron />}
                </Pressable>
              );
            })}
            {isPatron && (
              <Pressable onPress={() => { setOpen(false); go({ name: 'shopAdd' }); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(36,51,43,0.08)' }}>
                <IconTile size={42}><PlusIcon size={20} color={colors.green} /></IconTile>
                <Text style={{ flex: 1, color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>Ajouter une boutique</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
