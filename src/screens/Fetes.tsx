import React, { useMemo } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { Badge, Body, Card, DateTile, Title } from '../components/ui';
import { colors, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { daysUntil, inDaysLabel, upcomingEvents } from '../lib/events';

/** Écran 4 : le calendrier des fêtes, filtré selon le métier du commerçant. */
export function Fetes() {
  const { business, posts, prefs, setPrefs, go } = useApp();
  const b = business!;
  const events = useMemo(() => upcomingEvents(b.businessType, new Date(), 12, b.postalCode), [b]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 32 }}>
      <Title size={30}>Vos fêtes</Title>
      <Body soft>Les occasions utiles pour votre commerce, sur les 12 prochains mois.</Body>

      <View style={{ backgroundColor: colors.orangeSoft, borderRadius: radius.md + 2, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Body style={{ fontWeight: '700' }}>Rappels avant chaque fête</Body>
          <Body size={14}>On vous prévient quelques jours avant. Vous envoyez une photo, vous validez d'un geste. Rien n'est publié sans votre accord.</Body>
        </View>
        <Switch value={prefs.enabled} onValueChange={(v) => setPrefs({ ...prefs, enabled: v })} trackColor={{ true: colors.green, false: '#D6DBD5' }} thumbColor="#fff" accessibilityLabel="Activer les rappels avant chaque fête" />
      </View>

      {events.map((e) => {
        const n = daysUntil(e.date);
        const done = posts.some((p) => p.occasionId === e.id && p.status === 'published');
        const soon = n <= e.notifyDaysBefore;
        return (
          <Card key={e.id} onPress={() => go({ name: 'create', occasionId: e.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <DateTile date={e.date} tone={done ? 'green' : soon ? 'orange' : n < 45 ? 'blue' : 'red'} />
            <View style={{ flex: 1, gap: 2 }}>
              <Body style={{ fontWeight: '700' }}>{e.name} {e.emoji}</Body>
              <Body soft size={14}>{e.strategy}</Body>
              {e.note ? <Body size={13} style={{ color: colors.orangeText }}>{e.note}</Body> : null}
            </View>
            {done ? <Badge text="Publié" tone="green" /> : soon ? <Badge text={inDaysLabel(n)} tone="orange" /> : <Badge text="Bientôt" />}
          </Card>
        );
      })}
    </ScrollView>
  );
}
