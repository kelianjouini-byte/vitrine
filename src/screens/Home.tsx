import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Body, Card, DateTile, Label, Notice, Title } from '../components/ui';
import { takePhoto } from '../lib/photo';
import { FriendlyError } from '../lib/api';
import { CameraIcon, CheckIcon, SparkIcon } from '../components/icons';
import { colors, fonts, radius } from '../lib/theme';
import { useApp } from '../lib/store';
import { daysUntil, inDaysLabel, upcomingEvents } from '../lib/events';
import { initials } from '../lib/business';
import { MonthReportCard } from '../components/MonthReportCard';

export function Home() {
  const { business, posts, connections, go } = useApp();
  const b = business!;
  const next = useMemo(() => upcomingEvents(b, new Date(), 12, b.postalCode)[0], [b]);
  const connected = connections.filter((c) => c.status === 'connected').length;
  const scheduled = posts.find((p) => p.status === 'scheduled');
  const days = next ? daysUntil(next.date) : 0;
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Un seul geste : le bouton ouvre directement l'appareil photo, puis le recadrage.
  async function shoot() {
    setPhotoError(null);
    try {
      const photo = await takePhoto();
      if (photo) go({ name: 'create', photo });
    } catch (e) {
      setPhotoError(e instanceof FriendlyError ? e.message : "La photo n'a pas pu être ouverte. Réessayez.");
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 32 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Body soft size={15}>Bonjour {b.ownerFirstName}</Body>
          <Title size={28}>{b.businessName}</Title>
        </View>
        <Pressable onPress={() => go({ name: 'settings' })} accessibilityLabel="Mon compte et réglages"
          style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#FBE3E6', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#C2556A', fontWeight: '700', fontSize: 18, fontFamily: fonts.body }}>{initials(b.businessName)}</Text>
        </Pressable>
      </View>

      <Pressable onPress={shoot} accessibilityRole="button" accessibilityLabel="Prendre une photo"
        style={({ pressed }) => ({ backgroundColor: colors.greenDark, borderRadius: radius.lg + 4, paddingVertical: 34, alignItems: 'center', gap: 14, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
          <CameraIcon size={42} />
        </View>
        <Text style={{ color: colors.white, fontSize: 24, fontWeight: '700', letterSpacing: 0.5, fontFamily: fonts.body }}>PRENDRE UNE PHOTO</Text>
        <Text style={{ color: '#CFE6D8', fontSize: 16, fontFamily: fonts.body }}>Votre prochain post est à portée de main.</Text>
      </Pressable>
      <Pressable onPress={() => go({ name: 'ideas' })} accessibilityRole="button" accessibilityLabel="Je ne sais pas quoi poster : voir 3 idées"
        style={({ pressed }) => ({ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.orange, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
          <SparkIcon size={24} color={colors.orangeText} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', fontFamily: fonts.body }}>Je ne sais pas quoi poster</Text>
          <Text style={{ color: colors.textSoft, fontSize: 15, fontFamily: fonts.body }}>Vitrine vous propose 3 idées de photos</Text>
        </View>
        <Text style={{ color: colors.orangeText, fontSize: 22, fontWeight: '700' }}>›</Text>
      </Pressable>

      {photoError && (
        <View style={{ gap: 10 }}>
          <Notice tone="red" title="Nous avons besoin de votre attention" text={photoError} />
          <Pressable onPress={() => go({ name: 'create' })} accessibilityRole="button">
            <Text style={{ color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>Choisir une photo dans la galerie →</Text>
          </Pressable>
        </View>
      )}

      {next && (
        <View style={{ gap: 10 }}>
          <Label>Prochaine occasion</Label>
          <Card onPress={() => go({ name: 'create', occasionId: next.id })} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <DateTile date={next.date} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '700' }} size={18}>{next.name} {next.emoji}</Body>
                <Body soft size={15}>{inDaysLabel(days)}</Body>
              </View>
            </View>
            <Body soft size={15}>{next.strategy} Vitrine s'occupe de votre publication.</Body>
            <Text style={{ color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>Découvrir →</Text>
          </Card>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <Label>Ce mois-ci</Label>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><MonthReportCard /></View>
          <View style={{ flex: 1 }}>
            <Card onPress={() => go({ name: 'settings' })}>
              <Title size={30}>{connected}/2</Title>
              <Body soft size={14}>réseaux connectés</Body>
            </Card>
          </View>
        </View>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
            <CheckIcon size={20} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>{scheduled ? 'Publication programmée' : 'Aucune publication programmée'}</Body>
            <Body soft size={14}>{scheduled ? new Date(scheduled.createdAt).toLocaleDateString('fr-FR') : 'Vous recevrez un rappel avant chaque fête.'}</Body>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
