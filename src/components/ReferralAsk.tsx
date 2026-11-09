import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Body, Button, Title } from './ui';
import { PeopleIcon } from './icons';
import { colors, radius } from '../lib/theme';
import { load, save } from '../lib/storage';
import { isBackendConfigured } from '../lib/config';

/**
 * Après un bon bilan du mois (mois terminé, au moins un post) : on propose UNE fois par mois
 * d'en parler à un commerçant qu'il connaît. Il est content, c'est le bon moment.
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
          <Body soft center>Vous connaissez un commerçant à qui Vitrine rendrait service ? Parlez-lui-en.</Body>
          <Body soft center size={14}>Pour vous remercier : 10 € de moins par mois pour vous, et 10 € de moins pendant 3 mois pour lui.</Body>
          <Button title="En parler à un commerçant" onPress={() => { setOpen(false); onSend(); }} />
          <Button title="Plus tard" kind="ghost" onPress={() => setOpen(false)} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
