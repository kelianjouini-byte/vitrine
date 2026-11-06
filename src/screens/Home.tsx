import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Body, Card, Chevron, DateTile, IconTile, Label, Notice, Title } from '../components/ui';
import { takePhoto } from '../lib/photo';
import { accountState, FriendlyError } from '../lib/api';
import { BulbIcon, CameraIcon, ChartUpIcon, CheckIcon, GearIcon, LinkIcon, StoreIcon, StoryIcon } from '../components/icons';
import { daysLeft, isLiveStatus, TRIAL_REPORT_DAYS_BEFORE } from '../lib/billing';
import { colors, fonts, glassSurface, greenGradient } from '../lib/theme';
import { useApp } from '../lib/store';
import { daysUntil, inDaysLabel, upcomingEvents, upcomingHolidays } from '../lib/events';
import { announceDate, dayKey, holidayAnswer } from '../lib/planning';
import { MonthReportCard } from '../components/MonthReportCard';

export function Home() {
  const { business, posts, connections, go, billing } = useApp();
  const trialLeft = billing?.access === 'trial' && !isLiveStatus(billing.subscription?.status) ? daysLeft(billing.trialEndsAt) : null;
  const b = business!;
  // Prochaine fête ou prochain jour férié, le plus proche des deux.
  const next = useMemo(() => [upcomingEvents(b, new Date(), 12, b.postalCode)[0], upcomingHolidays(new Date(), 12, b.postalCode)[0]]
    .filter(Boolean).sort((x, y) => x.date.getTime() - y.date.getTime())[0], [b]);
  const isHoliday = next?.category === 'ferie';
  const answer = isHoliday ? holidayAnswer(b, next) : undefined;
  // Jour férié : on ouvre le planning le jour où prévenir les clients (ou le jour même s'il est déjà passé).
  const openNext = () => {
    if (!isHoliday) return go({ name: 'create', occasionId: next.id });
    const ann = dayKey(announceDate(b, next));
    go({ name: 'planDay', day: ann >= dayKey(new Date()) ? ann : dayKey(next.date) });
  };
  const connected = connections.filter((c) => c.status === 'connected').length;
  const scheduled = posts.find((p) => p.status === 'scheduled');
  const days = next ? daysUntil(next.date) : 0;
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Le gros bouton propose 2 choix : un post (photo + texte de l'IA) ou une story (photo ou vidéo).
  const [choosing, setChoosing] = useState(false);
  // Compte sans e-mail : après le 1er post, on propose de le protéger (sinon, perdu en changeant de téléphone).
  const [guest, setGuest] = useState(false);
  useEffect(() => { accountState().then((a) => setGuest(a.kind === 'guest')).catch(() => {}); }, [posts.length]);

  // Post : l'appareil photo s'ouvre tout de suite, la photo est cadrée toute seule.
  async function shoot() {
    setChoosing(false);
    setPhotoError(null);
    try {
      const photo = await takePhoto();
      if (photo) go({ name: 'create', photo });
    } catch (e) {
      setPhotoError(e instanceof FriendlyError ? e.message : "La photo n'a pas pu être ouverte. Réessayez.");
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Body size={17} style={{ color: colors.greenDark, fontWeight: '600' }}>Bonjour {b.ownerFirstName}</Body>
          <Title size={30}>{b.businessName}</Title>
        </View>
        <Pressable onPress={() => go({ name: 'settings' })} accessibilityRole="button" accessibilityLabel="Réglages"
          style={({ pressed }) => ({ alignItems: 'center', gap: 4, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <View style={{ ...glassSurface, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }}>
            <GearIcon size={28} color={colors.green} />
          </View>
          <Text style={{ color: colors.greenDark, fontWeight: '600', fontSize: 14, fontFamily: fonts.body }}>Réglages</Text>
        </Pressable>
      </View>

      {/* Le geste principal : un gros bouton rond, au centre, entouré d'un anneau de verre. */}
      <Pressable onPress={() => setChoosing((c) => !c)} accessibilityRole="button" accessibilityLabel="Créer un post ou une story" accessibilityState={{ expanded: choosing }}
        style={({ pressed }) => ({ alignItems: 'center', gap: 14, paddingVertical: 10, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <View style={{ width: 172, height: 172, borderRadius: 86, backgroundColor: 'rgba(255,255,255,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 22px 40px -14px rgba(31,95,69,0.5)' }}>
          <View style={{ ...greenGradient, width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center' }}>
            <CameraIcon size={58} />
          </View>
        </View>
        <Text style={{ color: colors.greenDark, fontSize: 23, fontWeight: '700', fontFamily: fonts.body }}>Créer</Text>
        <Body soft size={16}>{choosing ? 'Que voulez-vous publier ?' : 'Votre prochain post est à portée de main.'}</Body>
      </Pressable>

      {choosing && (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Choice icon={<CameraIcon size={30} color={colors.green} />} title="Post" text="Photo + texte écrit par l'IA" onPress={shoot} />
          <Choice icon={<StoryIcon size={30} color={colors.green} />} title="Story" text="Photo ou vidéo qui reste 24 h" onPress={() => { setChoosing(false); go({ name: 'story' }); }} />
        </View>
      )}

      <Card onPress={() => go({ name: 'ideas' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <IconTile><BulbIcon size={24} color={colors.green} /></IconTile>
        <View style={{ flex: 1 }} accessible accessibilityLabel="Je ne sais pas quoi poster : voir 3 idées">
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', fontFamily: fonts.body }}>Je ne sais pas quoi poster</Text>
          <Text style={{ color: colors.textSoft, fontSize: 15, fontFamily: fonts.body }}>Vitrine vous propose 3 idées de photos</Text>
        </View>
        <Chevron />
      </Card>

      {photoError && (
        <View style={{ gap: 10 }}>
          <Notice tone="red" title="Nous avons besoin de votre attention" text={photoError} />
          <Pressable onPress={() => go({ name: 'create' })} accessibilityRole="button">
            <Text style={{ color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>Choisir une photo dans la galerie →</Text>
          </Pressable>
        </View>
      )}

      {trialLeft !== null && trialLeft <= TRIAL_REPORT_DAYS_BEFORE && (
        <Card onPress={() => go({ name: 'offers' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(252,239,217,0.8)' }}>
          <IconTile size={44} tone="orange"><ChartUpIcon size={22} color={colors.orangeText} /></IconTile>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>{trialLeft <= 1 ? 'Dernier jour de votre essai gratuit' : `Votre essai gratuit se termine dans ${trialLeft} jours`}</Body>
            <Body soft size={15}>Voir mon bilan et choisir mon offre.</Body>
          </View>
          <Chevron />
        </Card>
      )}

      {guest && posts.length > 0 && (
        <Card onPress={() => go({ name: 'settings' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(252,239,217,0.8)' }}>
          <IconTile size={44} tone="orange"><StoreIcon size={22} color={colors.orangeText} /></IconTile>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>Protégez votre compte</Body>
            <Body soft size={15}>Ajoutez votre e-mail pour retrouver votre boutique si vous changez de téléphone.</Body>
          </View>
          <Chevron />
        </Card>
      )}

      {next && (
        <View style={{ gap: 10 }}>
          <Label>Prochaine occasion</Label>
          <Card onPress={openNext} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <DateTile date={next.date} tone={isHoliday ? 'green' : 'orange'} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: '700' }} size={18}>{next.name}</Body>
                <Body soft size={15}>{inDaysLabel(days)}</Body>
              </View>
            </View>
            <Body soft size={15}>
              {isHoliday
                ? (answer ? `Vous êtes ${answer.open ? 'ouvert' : 'fermé'} : prévenez vos clients la veille, Vitrine prépare le post.` : 'Êtes-vous ouvert ce jour-là ? Dites-le à Vitrine, on prévient vos clients.')
                : `${next.strategy} Vitrine s'occupe de votre publication.`}
            </Body>
            <Text style={{ color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>{isHoliday && !answer ? 'Répondre ›' : 'Découvrir ›'}</Text>
          </Card>
        </View>
      )}

      <View style={{ gap: 10 }}>
        <Label>Ce mois-ci</Label>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><MonthReportCard /></View>
          <View style={{ flex: 1 }}>
            {/* Pas de « 0/2 » décourageant : tant que tout n'est pas connecté, on propose de le faire. */}
            <Card onPress={() => go({ name: 'settings' })} style={{ gap: 6 }}>
              {connected >= 2 ? (
                <>
                  <IconTile size={40}><CheckIcon size={20} color={colors.green} /></IconTile>
                  <Body style={{ fontWeight: '700' }}>Instagram et Facebook connectés</Body>
                </>
              ) : (
                <>
                  <IconTile size={40} tone="orange"><LinkIcon size={20} color={colors.orangeText} /></IconTile>
                  <Body style={{ fontWeight: '700' }}>{connected === 0 ? 'Connecter Instagram et Facebook' : 'Connecter mon 2e réseau'}</Body>
                  <Text style={{ color: colors.green, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>Connecter ›</Text>
                </>
              )}
            </Card>
          </View>
        </View>
        {scheduled && (
          <Card onPress={() => go({ name: 'planning' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <IconTile size={40}><CheckIcon size={20} color={colors.green} /></IconTile>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }}>Un post est prêt</Body>
              <Body soft size={15}>Prévu le {new Date(scheduled.scheduledFor ?? scheduled.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</Body>
            </View>
            <Chevron />
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

/** Un des 2 choix du gros bouton : grande carte facile à toucher. */
function Choice({ icon, title, text, onPress }: { icon: React.ReactNode; title: string; text: string; onPress: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Card onPress={onPress} style={{ alignItems: 'center', gap: 8, paddingVertical: 20, paddingHorizontal: 12 }}>
        <IconTile size={60}>{icon}</IconTile>
        <Text style={{ color: colors.text, fontSize: 21, fontWeight: '700', fontFamily: fonts.body }} accessibilityLabel={`${title} : ${text}`}>{title}</Text>
        <Text style={{ color: colors.textSoft, fontSize: 15, textAlign: 'center', fontFamily: fonts.body }}>{text}</Text>
      </Card>
    </View>
  );
}
