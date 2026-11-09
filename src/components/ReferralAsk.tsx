import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Body, Button, Title } from './ui';
import { PeopleIcon } from './icons';
import { colors, fonts, radius } from '../lib/theme';
import { load, save } from '../lib/storage';
import { isBackendConfigured } from '../lib/config';

/**
 * Après un bon bilan du mois (mois terminé, au moins un post) : on propose UNE fois par mois
 * d'envoyer son code de parrainage. Le commerçant est content, c'est le bon moment pour demander.
 */
export function ReferralAsk({ monthKey, eligible, onSend }: { monthKey: string; eligible: boolean; onSend: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!eligible || !isBackendConfigured) return;
    let alive = true;
    load<string>('referralAskedFor', '').then((last) => {
      if (!alive || last === monthKey) return;
      // Petit délai : le commerçant voit d'abord ses chiffres.
      setTimeout(() => alive && setOpen(true), 1500);
      save('referralAskedFor', monthKey);
    });
    return () => { alive = false; };
  }, [eligible, monthKey]);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(36,51,43,0.35)', justifyContent: 'flex-end', padding: 12 }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 536, alignSelf: 'center', backgroundColor: colors.white, borderRadius: radius.xl, padding: 24, gap: 12 }}>
          <View style={{ alignSelf: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: colors.greenSoft, borderWidth: 2, borderColor: colors.orange, alignItems: 'center', justifyContent: 'center' }}>
            <PeopleIcon size={30} color={colors.green} />
          </View>
          <Title size={25} style={{ textAlign: 'center' }}>Un bon mois !</Title>
          <Body soft center>Un commerçant près de chez vous pourrait en profiter aussi.</Body>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Gift value="-10 €" text="pour vous, chaque mois" />
            <Gift value="-10 €" text="pour lui, pendant 3 mois" />
          </View>
          <Button title="Envoyer mon code" onPress={() => { setOpen(false); onSend(); }} />
          <Button title="Plus tard" kind="ghost" onPress={() => setOpen(false)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Gift({ value, text }: { value: string; text: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: 'rgba(220,239,227,0.55)' }}>
      <Text style={{ fontFamily: fonts.title, fontSize: 22, fontWeight: '700', color: colors.text }}>{value}</Text>
      <Text style={{ fontSize: 13, color: colors.textSoft, textAlign: 'center', fontFamily: fonts.body }}>{text}</Text>
    </View>
  );
}
