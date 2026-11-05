import React, { useMemo } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { Badge, Body, Card, DateTile, Title } from '../components/ui';
import { colors, fonts, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { daysUntil, inDaysLabel, upcomingEvents, upcomingHolidays } from '../lib/events';
import { dayKey, holidayAnswer, holidayName } from '../lib/planning';

/** Écran 4 : le calendrier des fêtes, filtré selon le métier du commerçant. */
export function Fetes() {
  const { business, posts, prefs, setPrefs, go } = useApp();
  const b = business!;
  // Fêtes et jours fériés, dans l'ordre des dates. Un férié qui tombe le jour d'une fête (Noël, 1er janvier...)
  // n'a pas sa propre carte : la question « Êtes-vous ouvert ? » s'affiche dans la carte de la fête.
  const items = useMemo(() => {
    const fetes = upcomingEvents(b, new Date(), 12, b.postalCode);
    const holidays = upcomingHolidays(new Date(), 12, b.postalCode);
    const byDay = new Map(holidays.map((h) => [dayKey(h.date), h]));
    const merged = fetes.map((e) => ({ event: e, holiday: byDay.get(dayKey(e.date)) ?? null }));
    const used = new Set(merged.map((m) => m.holiday?.id).filter(Boolean));
    const alone = holidays.filter((h) => !used.has(h.id)).map((h) => ({ event: h, holiday: h }));
    return [...merged, ...alone].sort((x, y) => x.event.date.getTime() - y.event.date.getTime());
  }, [b]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 32 }}>
      <Title size={30}>Vos fêtes</Title>
      <Body soft>Les occasions utiles pour votre commerce, sur les 12 prochains mois.</Body>

      <View style={{ backgroundColor: colors.orangeSoft, borderRadius: radius.md + 2, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Body style={{ fontWeight: '700' }}>Rappels avant chaque fête</Body>
          <Body size={15}>On vous prévient quelques jours avant. Vous envoyez une photo, vous validez d'un geste. Rien n'est publié sans votre accord.</Body>
        </View>
        <Switch value={prefs.enabled} onValueChange={(v) => setPrefs({ ...prefs, enabled: v })} trackColor={{ true: colors.green, false: '#D6DBD5' }} thumbColor="#fff" accessibilityLabel="Activer les rappels avant chaque fête" />
      </View>

      {items.map(({ event: e, holiday: h }) => {
        const n = daysUntil(e.date);
        const a = h ? holidayAnswer(b, h) : undefined;
        const askOpen = h && !a;
        const holidayLine = h ? (a ? `Jour férié : vous êtes ${a.open ? 'ouvert' : 'fermé'}. Prévenez vos clients la veille.` : 'Jour férié : êtes-vous ouvert ce jour-là ?') : null;
        const openHoliday = () => go({ name: 'planDay', day: dayKey(e.date) });

        if (e.category === 'ferie') {
          return (
            <Card key={e.id} onPress={openHoliday} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <DateTile date={e.date} tone="green" />
              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontWeight: '700' }}>{holidayName(e)}</Body>
                <Body soft size={15}>{a ? `Jour férié : vous êtes ${a.open ? 'ouvert' : 'fermé'}. Prévenez vos clients la veille.` : 'Jour férié. Êtes-vous ouvert ce jour-là ?'}</Body>
              </View>
              <Badge text={a ? (a.open ? 'Ouvert' : 'Fermé') : 'Répondre'} tone={a ? 'green' : 'orange'} />
            </Card>
          );
        }
        const done = posts.some((p) => p.occasionId === e.id && p.status === 'published');
        const soon = n <= e.notifyDaysBefore;
        return (
          <Card key={e.id} onPress={() => go({ name: 'create', occasionId: e.id })} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <DateTile date={e.date} tone={done ? 'green' : 'orange'} />
              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontWeight: '700' }}>{e.name}</Body>
                <Body soft size={15}>{e.strategy}</Body>
                {e.note ? <Body size={15} style={{ color: colors.orangeText }}>{e.note}</Body> : null}
                {!done && !soon ? <Body size={15} style={{ color: colors.green, fontWeight: '600' }}>{inDaysLabel(n)}</Body> : null}
              </View>
              {done ? <Badge text="Publié" tone="green" /> : soon ? <Badge text={inDaysLabel(n)} tone="orange" /> : null}
            </View>
            {holidayLine && (
              <Pressable onPress={openHoliday} accessibilityRole="button" hitSlop={6}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(36,51,43,0.08)', paddingTop: 10 }}>
                <Body size={15} style={{ flex: 1, color: colors.text }}>{holidayLine}</Body>
                <Text style={{ color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>{askOpen ? 'Répondre ›' : 'Modifier ›'}</Text>
              </Pressable>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
