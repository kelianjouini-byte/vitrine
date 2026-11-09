import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, IconTile, Title } from '../components/ui';
import { GlassBackground } from '../components/GlassBackground';
import { ClockIcon } from '../components/icons';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { signOut } from '../lib/api';

/** L'abonnement de la boutique est en pause : l'employé ne peut rien faire, il prévient son patron. */
export function EmployeePaused() {
  const { team, refreshBilling, resetAll } = useApp();
  const insets = useSafeAreaInsets();
  const patron = team?.ownerFirstName ?? 'votre patron';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <GlassBackground />
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 60, gap: 18, alignItems: 'center' }}>
        <IconTile size={84} tone="orange"><ClockIcon size={40} color={colors.orangeText} /></IconTile>
        <Title size={28} style={{ textAlign: 'center' }}>Vitrine est en pause</Title>
        <Body soft center>L'abonnement de la boutique n'est pas encore choisi. Prévenez {patron} : dès que c'est fait, vous retrouvez tout.</Body>
        <Button title="C'est fait, réessayer" onPress={refreshBilling} style={{ alignSelf: 'stretch' }} />
        <Button title="Me déconnecter" kind="ghost" onPress={async () => { await signOut(); await resetAll(); }} />
      </ScrollView>
    </View>
  );
}
