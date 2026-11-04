import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { BackButton, Badge, Body, Button, Card, Chip, IconTile, Label, Notice, PostThumb, Title } from '../components/ui';
import { BulbIcon, CameraIcon, ClockIcon, RefreshIcon, StoryIcon } from '../components/icons';
import { colors } from '../lib/theme';
import { useApp } from '../lib/store';
import { upcomingEvents, upcomingHolidays } from '../lib/events';
import { HolidayCard } from '../components/HolidayCard';
import { isBackendConfigured } from '../lib/config';
import { FriendlyError, NotConfiguredError, publishPost } from '../lib/api';
import { notificationsSupported } from '../lib/notifications';
import { announceDate, buildWeek, dayKey, dayLabel, DAY_NAMES, holidayAnswer, holidayNote, parseDayKey, postsOfDay, statusAfterPublish, weekday, weekStart, type DayKind } from '../lib/planning';
import { KIND_BADGE } from './Planning';
import type { Post, PublicationResult } from '../lib/types';

/** Un jour du planning : le conseil de Vitrine, ou le post préparé à l'avance. */
export function PlanDay({ day: key }: { day: string }) {
  const { business, posts, prefs, planChoices, setDayChoice, go, back, upsertPost, saveBusiness } = useApp();
  const b = business!;
  const date = parseDayKey(key);
  const day = useMemo(() => buildWeek(b, weekStart(date), planChoices, upcomingEvents(b, weekStart(date), 2, b.postalCode), upcomingHolidays(weekStart(date), 2, b.postalCode)).find((d) => d.key === key)!, [b, key, planChoices]);
  const today = dayKey(new Date());
  const isToday = key === today;
  const past = key < today;
  const mine = postsOfDay(posts, key);
  const ready = mine.find((p) => p.status === 'scheduled');
  const done = mine.filter((p) => p.status !== 'scheduled');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choice = planChoices[key] ?? {};
  const choose = (kind: DayKind) => setDayChoice(key, { kind: kind === day.advice ? undefined : kind, shift: choice.shift });
  const otherIdea = () => setDayChoice(key, { ...choice, shift: (choice.shift ?? 0) + 1 });
  const when = `${DAY_NAMES[weekday(date)]} à ${prefs.hour} h`;

  async function publishReady(p: Post) {
    setPublishing(true);
    setError(null);
    let publications: PublicationResult[];
    try {
      if (!isBackendConfigured) throw new NotConfiguredError('meta');
      if (!p.imagePaths?.length) throw new FriendlyError("Les photos de ce post ne sont plus disponibles. Préparez-le à nouveau.");
      publications = await publishPost({ postId: p.id, caption: p.caption, hashtags: p.hashtags, platforms: p.platforms, imagePaths: p.imagePaths, idempotencyKey: p.idempotencyKey ?? Crypto.randomUUID() });
    } catch (e) {
      const notConfigured = e instanceof NotConfiguredError;
      publications = p.platforms.map((platform) => ({
        platform,
        status: notConfigured ? 'not_configured' : 'failed',
        error: notConfigured ? null : e instanceof FriendlyError ? e.message : 'La publication a échoué.',
      }));
    }
    const status = statusAfterPublish(publications);
    const ok = status === 'published' || status === 'partially_published';
    if (status === 'draft') {
      // Publication pas encore branchée : le post reste prévu, on le dit honnêtement.
      setPublishing(false);
      setError("La publication sur Instagram et Facebook n'est pas encore branchée. Votre post reste prêt dans le planning.");
      return;
    }
    upsertPost({ ...p, status, publications, publishedAt: ok ? new Date().toISOString() : null });
    setPublishing(false);
    go({ name: 'published', postId: p.id });
  }

  const unplan = (p: Post) => upsertPost({ ...p, status: 'draft', scheduledFor: null });

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <BackButton onPress={back} />
      <Title size={24} style={{ flex: 1 }}>{isToday ? `Aujourd'hui, ${dayLabel(date).toLowerCase()}` : dayLabel(date)}</Title>
    </View>
  );

  const honest = (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <ClockIcon size={20} color={colors.green} />
      <Body soft size={14} style={{ flex: 1 }}>
        {notificationsSupported ? `${when}, Vitrine vous le rappellera. ` : 'Dans l\'application sur téléphone, Vitrine vous le rappelle le jour venu. '}
        La publication toute seule arrivera dès que la connexion Instagram et Facebook sera ouverte.
      </Body>
    </View>
  );

  const hasPost = day.kind === 'post' || day.kind === 'both';
  const hasStory = day.kind === 'story' || day.kind === 'both';
  const storyDone = done.some((p) => p.kind === 'story');
  // La story se fait le jour même : un bouton aujourd'hui, sinon on explique.
  const storyPart = isToday ? (
    <Button title="FAIRE MA STORY" icon={<StoryIcon size={22} />} style={{ minHeight: 64 }} kind={day.kind === 'both' ? 'secondary' : 'primary'} onPress={() => go({ name: 'story' })} />
  ) : (
    <Notice tone="green" title="Une story se fait le jour même"
      text={notificationsSupported ? `C'est fait pour être sur le vif. ${when}, Vitrine vous enverra l'idée.` : 'C\'est fait pour être sur le vif. Revenez ce jour-là : le bouton pour la faire sera ici.'} />
  );

  // Un post est déjà préparé pour ce jour.
  if (ready) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
        {header}
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Badge text="Post" tone="green" />
            <Badge text="Prévu" tone="green" />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <PostThumb post={ready} width={96} height={120} />
            <View style={{ flex: 1, gap: 6 }}>
              <Body size={15}>{ready.caption.length > 180 ? `${ready.caption.slice(0, 180)}...` : ready.caption}</Body>
              <Body size={14} style={{ color: '#2F5FA8' }}>{ready.hashtags.slice(0, 5).join(' ')}</Body>
            </View>
          </View>
        </Card>
        <Card style={{ gap: 10 }}>{honest}</Card>
        {error && <Notice tone="orange" title="Pas encore possible" text={error} />}
        <Button title="PUBLIER MAINTENANT" onPress={() => publishReady(ready)} loading={publishing} style={{ minHeight: 64 }} />
        <Button title="Retirer du planning" kind="ghost" onPress={() => unplan(ready)} disabled={publishing} />
        <Body soft size={13} center>Le post retiré reste dans « Mes posts ».</Body>
        {day.kind === 'both' && !storyDone && (
          <>
            <Label>Et la story du jour</Label>
            {day.storyIdea && <Body>{day.storyIdea.photo}</Body>}
            {storyPart}
          </>
        )}
      </ScrollView>
    );
  }

  const idea = day.idea;
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
      {header}

      {done.length > 0 && (
        <>
          <Label>Publié ce jour-là</Label>
          {done.map((p) => (
            <Card key={p.id} onPress={() => go({ name: 'published', postId: p.id })} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <PostThumb post={p} width={56} height={70} />
              <Body size={15} style={{ flex: 1 }}>{p.kind === 'story' ? 'Votre story' : p.caption.split('\n')[0].slice(0, 60)}</Body>
              <Badge text="Publié" tone="green" />
            </Card>
          ))}
        </>
      )}

      {!past && (day.holiday ?? day.announce) && (
        <HolidayCard business={b} holiday={(day.holiday ?? day.announce)!} onSave={saveBusiness}
          announceLabel={dayLabel(announceDate(b, (day.holiday ?? day.announce)!)).toLowerCase()} />
      )}

      {past ? (
        done.length === 0 && <Body soft>Ce jour est passé. Regardez les jours qui viennent pour préparer vos prochains posts.</Body>
      ) : (
        <>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <IconTile size={44}><BulbIcon size={24} color={colors.green} /></IconTile>
              <View style={{ gap: 4, flex: 1 }}>
                <Label>Le conseil de Vitrine</Label>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <Badge text={KIND_BADGE[day.kind].text} tone={KIND_BADGE[day.kind].tone} />
                  {day.occasion && <Badge text={day.occasion.name} tone="orange" />}
                </View>
              </View>
            </View>
            {day.kind === 'rest' ? (
              <Body soft>{day.holiday && holidayAnswer(b, day.holiday)?.open === false ? 'Jour férié : la boutique est fermée. Vos clients sont prévenus avec le post de la veille.' : day.closed ? 'La boutique est fermée : profitez-en pour souffler.' : 'Une journée sans publier, c\'est très bien aussi. Vos clients ne veulent pas un post tous les jours.'}</Body>
            ) : idea ? (
              <>
                {day.kind === 'both' && <Label>Le post</Label>}
                <Title size={21}>{idea.title}</Title>
                <Body>{idea.photo}</Body>
                <Body soft size={14}>{idea.why}</Body>
              </>
            ) : null}
            {day.kind === 'both' && day.storyIdea && (
              <View style={{ gap: 6, marginTop: 6 }}>
                <Label>La story</Label>
                <Title size={19}>{day.storyIdea.title}</Title>
                <Body>{day.storyIdea.photo}</Body>
              </View>
            )}
          </Card>

          <Label>Vous préférez ?</Label>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(['post', 'story', 'both', 'rest'] as DayKind[]).map((k) => (
              <Chip key={k} label={KIND_BADGE[k].text} selected={day.kind === k} onPress={() => choose(k)} />
            ))}
          </View>

          {hasPost && (
            <Button title={isToday ? 'FAIRE MON POST' : 'PRÉPARER MAINTENANT'} icon={<CameraIcon size={22} />} style={{ minHeight: 64 }}
              onPress={() => go({ name: 'create', idea: idea ?? undefined, occasionId: day.occasion?.id, plannedFor: isToday ? undefined : key, note: day.announce ? holidayNote(b, day.announce) : undefined })} />
          )}
          {hasStory && !storyDone && storyPart}
          {day.kind !== 'rest' && !day.feteDay && !day.announce && (
            <Button title="Une autre idée" kind="secondary" icon={<RefreshIcon size={18} color={colors.green} />} onPress={otherIdea} />
          )}
          {hasPost && !isToday && (
            <Body soft size={14}>Vous prenez la photo, l'IA écrit le texte, et le post est rangé dans ce jour. Le jour venu, il ne reste qu'à appuyer sur « Publier ».</Body>
          )}
        </>
      )}
    </ScrollView>
  );
}
