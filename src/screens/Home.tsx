import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View, type ScrollViewInstance } from 'react-native';
import { Body, Button, Card, Chevron, DateTile, IconTile, Label, Notice, Title } from '../components/ui';
import { takePhoto, takePhotos, takeVideo, takeVideos } from '../lib/photo';
import { accountState, FriendlyError } from '../lib/api';
import { BulbIcon, ChartUpIcon, CheckIcon, GearIcon, ImageIcon, LinkIcon, StarIcon, StoreIcon } from '../components/icons';
import { daysLeft, euros, isLiveStatus, offersFrom, placesLeftText, TRIAL_REPORT_DAYS_BEFORE } from '../lib/billing';
import { colors, fonts, glassSurface } from '../lib/theme';
import { useApp } from '../lib/store';
import { daysUntil, inDaysLabel, upcomingEvents, upcomingHolidays } from '../lib/events';
import { announceDate, dayKey, holidayAnswer } from '../lib/planning';
import { MonthReportCard } from '../components/MonthReportCard';
import { ShopSwitcher } from '../components/ShopSwitcher';
import { PhotoButton } from '../components/PhotoButton';
import { MediaCard } from '../components/CreateChoice';
import { Platform } from 'react-native';
import { PersonIcon, SendIcon } from '../components/icons';
import { isStoreApp } from '../lib/native';
import { Bar, PointsPill } from '../components/PointsScene';
import { frNumber, levelOf, postsLeft } from '../lib/points';

export function Home() {
  const { business, posts, connections, go, billing, team, isPatron } = useApp();
  const trialLeft = isPatron && billing?.access === 'trial' && !isLiveStatus(billing.subscription?.status) ? daysLeft(billing.trialEndsAt) : null;
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
  // Le gros bouton propose 2 choix : Photo (post ou story) ou Vidéo (Reel ou story).
  const [choosing, setChoosing] = useState(false);
  // La carte touchée reste en couleur pleine pendant que la caméra s'ouvre.
  const [opening, setOpening] = useState<'photo' | 'video' | null>(null);
  // Compte sans e-mail : après le 1er post, on propose de le protéger (sinon, perdu en changeant de téléphone).
  const [guest, setGuest] = useState(false);
  useEffect(() => { accountState().then((a) => setGuest(a.kind === 'guest')).catch(() => {}); }, [posts.length]);
  const pending = isPatron ? team?.pending ?? 0 : 0;
  const mine = !isPatron ? team?.mine : undefined;
  // Points de l'équipe (null tant qu'ils ne sont pas installés sur le serveur) et petit mot du patron.
  const points = team?.points ?? null;
  const goal = points?.goal ?? null;
  const note = !isPatron ? team?.note : null;
  const level = points ? levelOf(points.mine) : null;
  // Petit téléphone : quand les choix Photo / Vidéo s'ouvrent, on les fait remonter à l'écran.
  const scroll = useRef<ScrollViewInstance>(null);
  const [publishY, setPublishY] = useState(0);
  useEffect(() => { if (choosing) setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, publishY - 8), animated: true }), 60); }, [choosing, publishY]);

  // Photo : l'appareil photo s'ouvre tout de suite ; ensuite « Où la publier ? » (post, story ou les deux).
  /** La carte touchée passe en couleur pleine un instant : on voit bien qu'elle a été choisie. */
  function flash(kind: 'photo' | 'video') {
    setOpening(kind);
    setTimeout(() => setOpening((k) => (k === kind ? null : k)), 900);
  }

  async function shootPhoto() {
    setPhotoError(null);
    flash('photo');
    try {
      const photo = await takePhoto();
      if (photo) {
        setChoosing(false);
        go({ name: 'choose', media: { kind: 'photo', raw: photo } });
      }
    } catch (e) {
      setPhotoError(e instanceof FriendlyError ? e.message : "La photo n'a pas pu être ouverte. Réessayez.");
    }
  }

  // Vidéo : la caméra de Vitrine (version web) ou celle du téléphone ; ensuite « Où la publier ? » (Reel, story ou les deux).
  async function shootVideo() {
    setPhotoError(null);
    if (Platform.OS === 'web') {
      setChoosing(false);
      return go({ name: 'capture' });
    }
    flash('video');
    try {
      const video = await takeVideo('camera');
      if (video) {
        setChoosing(false);
        go({ name: 'choose', media: video });
      }
    } catch (e) {
      setPhotoError(e instanceof FriendlyError ? e.message : "La vidéo n'a pas pu être ouverte. Réessayez.");
    }
  }

  // « Ma galerie » : une photo ou une vidéo déjà prise. Le sélecteur s'ouvre tout de suite (pas d'attente avant).
  async function fromGallery(kind: 'photo' | 'video') {
    setPhotoError(null);
    try {
      if (kind === 'video') {
        // Plusieurs vidéos choisies : Vitrine les monte ensemble en un seul Reel.
        const vs = await takeVideos();
        if (vs.length) setChoosing(false);
        if (vs.length === 1) go({ name: 'choose', media: vs[0] });
        else if (vs.length > 1) go({ name: 'montage', clips: vs.map((v) => ({ uri: v.uri })) });
        return;
      }
      const media = await takePhotos('library', 1).then(([raw]) => (raw ? { kind: 'photo' as const, raw } : null));
      if (media) {
        setChoosing(false);
        go({ name: 'choose', media });
      }
    } catch (e) {
      setPhotoError(e instanceof FriendlyError ? e.message : "La galerie n'a pas pu être ouverte. Réessayez.");
    }
  }

  return (
    <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 24 }}>
      <ShopSwitcher />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Body size={17} style={{ color: colors.greenDark, fontWeight: '600' }}>Bonjour {team?.firstName ?? b.ownerFirstName}</Body>
          <Title size={30}>{b.businessName}</Title>
          {trialLeft !== null && trialLeft > TRIAL_REPORT_DAYS_BEFORE && (
            <Body soft size={15} style={{ marginTop: 2 }}>{`Essai gratuit : encore ${trialLeft} jours`}</Body>
          )}
        </View>
        {!isPatron && points && <PointsPill points={points.mine} />}
        <Pressable onPress={() => go({ name: 'settings' })} accessibilityRole="button" accessibilityLabel="Réglages"
          style={({ pressed }) => ({ alignItems: 'center', gap: 4, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
          <View style={{ ...glassSurface, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }}>
            <GearIcon size={28} color={colors.green} />
          </View>
          <Text style={{ color: colors.greenDark, fontWeight: '600', fontSize: 14, fontFamily: fonts.body }}>Réglages</Text>
        </Pressable>
      </View>

      {/* Patron : les posts préparés par l'équipe attendent son accord. */}
      {pending > 0 && (
        <Card onPress={() => go({ name: 'review' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(252,239,217,0.85)', borderColor: 'rgba(242,182,109,0.6)' }}>
          <IconTile size={44} tone="orange"><PersonIcon size={22} color={colors.orangeText} /></IconTile>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>{pending > 1 ? `${pending} posts à valider` : '1 post à valider'}</Body>
            <Body soft size={15}>Préparé{pending > 1 ? 's' : ''} par votre équipe</Body>
          </View>
          <Text style={{ color: colors.orangeText, fontWeight: '700', fontSize: 16, fontFamily: fonts.body }}>Voir</Text>
        </Card>
      )}

      {/* Employé : la réponse du patron (en attente, ou refusé avec un petit mot). */}
      {mine && (mine.pending > 0 || mine.rejected > 0) && (
        <Card onPress={() => go({ name: 'posts' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: mine.rejected ? 'rgba(252,239,217,0.85)' : undefined }}>
          <IconTile size={44} tone={mine.rejected ? 'orange' : 'green'}><SendIcon size={22} color={mine.rejected ? colors.orangeText : colors.green} /></IconTile>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>
              {mine.rejected ? (mine.rejected > 1 ? `${mine.rejected} posts refusés` : '1 post refusé') : mine.pending > 1 ? `${mine.pending} posts envoyés` : '1 post envoyé'}
            </Body>
            <Body soft size={15}>{mine.rejected ? 'Voir le message du patron' : 'En attente de la réponse du patron'}</Body>
          </View>
          <Chevron />
        </Card>
      )}

      {/* Employé : le petit mot du patron. */}
      {note && (
        <Card style={{ gap: 4, backgroundColor: 'rgba(253,243,226,0.9)', borderColor: 'rgba(242,182,109,0.6)', borderWidth: 1.5 }}>
          <Text style={{ color: colors.orangeText, fontWeight: '700', fontSize: 15, fontFamily: fonts.body }}>Le mot de {note.by ?? team?.ownerFirstName}</Text>
          <Body size={18} style={{ fontWeight: '600' }}>« {note.text} »</Body>
        </Card>
      )}

      {/* Rien n'est connecté : sans Instagram ni Facebook, Vitrine ne peut rien publier. C'est donc la 1re chose à faire. */}
      {isPatron && connected === 0 && (
        <Card style={{ gap: 12, backgroundColor: 'rgba(252,239,217,0.9)', borderColor: colors.orange, borderWidth: 1.5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <IconTile size={48} tone="orange"><LinkIcon size={24} color={colors.orangeText} /></IconTile>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }} size={18}>Première étape</Body>
              <Body size={15}>Connectez Instagram et Facebook. Sans eux, Vitrine ne peut rien publier pour vous.</Body>
            </View>
          </View>
          <Button title="Connecter mes réseaux" onPress={() => go({ name: 'settings' })} style={{ minHeight: 52 }} />
        </Card>
      )}

      {/* Le geste principal : un gros bouton rond, au centre, avec des ondes orange autour. */}
      <Pressable onPress={() => setChoosing((c) => !c)} accessibilityRole="button" accessibilityLabel="Publier : une photo ou une vidéo" accessibilityState={{ expanded: choosing }}
        style={({ pressed }) => ({ alignItems: 'center', gap: 8, paddingVertical: 14, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <PhotoButton />
        <Text style={{ color: colors.greenDark, fontSize: 23, fontWeight: '700', fontFamily: fonts.body, marginTop: 6 }}>Publier</Text>
        <Body soft size={16}>{choosing ? 'Que voulez-vous montrer ?' : 'Touchez le bouton pour commencer'}</Body>
      </Pressable>

      {choosing && (
        <View style={{ gap: 10 }} onLayout={(e) => setPublishY(e.nativeEvent.layout.y)}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <MediaCard kind="photo" active={opening === 'photo'} onPress={shootPhoto} />
            <MediaCard kind="video" active={opening === 'video'} onPress={shootVideo} delay={120} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title="Ma galerie" kind="secondary" icon={<ImageIcon size={20} color={colors.green} />} onPress={() => fromGallery('photo')} style={{ flex: 1, paddingHorizontal: 8 }} />
            <Button title="Ma galerie" kind="secondary" icon={<ImageIcon size={20} color={colors.green} />} onPress={() => fromGallery('video')} style={{ flex: 1, paddingHorizontal: 8 }} />
          </View>
        </View>
      )}

      {/* Employé : son niveau. Tout le monde : l'objectif commun de l'équipe (pas de classement). */}
      {!isPatron && level && points && (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Body style={{ fontWeight: '700', flex: 1 }}>Niveau {level.number} : {level.name}</Body>
            <StarIcon size={22} color={colors.orangeText} />
          </View>
          <Body soft size={15}>{level.next ? `Encore ${frNumber(level.next - points.mine)} points pour « ${level.nextName} »` : 'Vous êtes au plus haut niveau. Bravo !'}</Body>
          <Bar value={level.progress} />
        </Card>
      )}
      {goal && (isPatron ? (team?.teamSize ?? 0) > 0 : true) && (
        <Card onPress={isPatron ? () => go({ name: 'team' }) : undefined} style={{ gap: 8, backgroundColor: 'rgba(253,243,226,0.9)', borderColor: 'rgba(242,182,109,0.6)', borderWidth: 1.5 }}>
          <Text style={{ color: colors.orangeText, fontWeight: '700', fontSize: 12, letterSpacing: 1, fontFamily: fonts.body }}>OBJECTIF DE L'ÉQUIPE</Text>
          <Body style={{ fontWeight: '700' }}>{goal.reachedAt ? `Objectif atteint : ${goal.reward} !` : goal.reward}</Body>
          <Bar value={goal.progress / goal.points} />
          <Body soft size={14}>
            {goal.reachedAt
              ? (isPatron ? 'Bravo à toute l\'équipe. Touchez pour fixer un nouvel objectif.' : 'Bravo à toute l\'équipe !')
              : `${frNumber(goal.progress)} / ${frNumber(goal.points)} points · encore environ ${postsLeft(goal.points, goal.progress)} posts publiés`}
          </Body>
        </Card>
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
            <Body soft size={15}>{isStoreApp ? 'Voir mon bilan et la suite.' : 'Voir mon bilan et choisir mon offre.'}</Body>
          </View>
          <Chevron />
        </Card>
      )}

      {!isStoreApp && trialLeft !== null && trialLeft > TRIAL_REPORT_DAYS_BEFORE && billing?.founder?.eligible && (
        <Card onPress={() => go({ name: 'offers' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(252,239,217,0.8)', borderColor: colors.orange }}>
          <IconTile size={44} tone="orange"><StarIcon size={22} color={colors.orangeText} /></IconTile>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>Offre fondateur : {placesLeftText(billing.founder.left).toLowerCase()}</Body>
            <Body soft size={15}>{euros(offersFrom(billing).find((o) => o.id === 'founder')!.priceCents)} par mois sans engagement, pour les {billing.founder.places} premières boutiques.</Body>
          </View>
          <Chevron />
        </Card>
      )}

      {guest && isPatron && posts.length > 0 && (
        <Card onPress={() => go({ name: 'settings' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(252,239,217,0.8)' }}>
          <IconTile size={44} tone="orange"><StoreIcon size={22} color={colors.orangeText} /></IconTile>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>Protégez votre compte</Body>
            <Body soft size={15}>Ajoutez votre e-mail et un mot de passe pour retrouver votre boutique si vous changez de téléphone.</Body>
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
          {isPatron && connected > 0 && <View style={{ flex: 1 }}>
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
          </View>}
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
