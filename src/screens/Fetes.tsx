import React, { useMemo } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { Badge, Body, Card, DateTile, Title } from '../components/ui';
import { colors, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { daysUntil, inDaysLabel, upcomingEvents, upcomingHolidays } from '../lib/events';
import { dayKey, holidayAnswer } from '../lib/planning';

/** Écran 4 : le calendrier des fêtes, filtré selon le métier du commerçant. */
export function Fetes() {
  const { business, posts, prefs, setPrefs, go } = useApp();
  const b = business!;
  // Fêtes et jours fériés, au même niveau, dans l'ordre des dates.
  const events = useMemo(() => [...upcomingEvents(b, new Date(), 12, b.postalCode), ...upcomingHolidays(new Date(), 12, b.postalCode)]
    .sort((x, y) => x.date.getTime() - y.date.getTime()), [b]);

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
        if (e.category === 'ferie') {
          // Jour férié : on demande si la boutique est ouverte (dans le planning, ce jour-là).
          const a = holidayAnswer(b, e);
          return (
            <Card key={e.id} onPress={() => go({ name: 'planDay', day: dayKey(e.date) })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <DateTile date={e.date} tone="blue" />
              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontWeight: '700' }}>{e.name}</Body>
                <Body soft size={14}>{a ? (a.open ? 'Vous êtes ouvert : prévenez vos clients la veille.' : 'Vous êtes fermé : prévenez vos clients la veille.') : 'Êtes-vous ouvert ce jour-là ? Appuyez pour le dire.'}</Body>
              </View>
              <Badge text={a ? (a.open ? 'Ouvert' : 'Fermé') : 'À dire'} tone={a ? 'green' : 'orange'} />
            </Card>
          );
        }
        const done = posts.some((p) => p.occasionId === e.id && p.status === 'published');
        const soon = n <= e.notifyDaysBefore;
        return (
          <Card key={e.id} onPress={() => go({ name: 'create', occasionId: e.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <DateTile date={e.date} tone={done ? 'green' : soon ? 'orange' : n < 45 ? 'blue' : 'red'} />
            <View style={{ flex: 1, gap: 2 }}>
              <Body style={{ fontWeight: '700' }}>{e.name}</Body>
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
