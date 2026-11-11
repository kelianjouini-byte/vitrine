import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Body, Button, Card, IconTile, Label, Notice, PostThumb, Title, BackButton } from '../components/ui';
import { ReferralAsk } from '../components/ReferralAsk';
import { BulbIcon, CameraIcon, ChartUpIcon, ClockIcon, EyeIcon, HeartIcon, MessageIcon, RefreshIcon, StarIcon, StoryIcon, VideoIcon } from '../components/icons';
import { colors, fonts, glass, greenGradient, radius } from '../lib/theme';
import type { Post } from '../lib/types';
import { useApp } from '../lib/store';
import { upcomingEvents } from '../lib/events';
import { tradeById } from '../lib/trades';
import { isBackendConfigured } from '../lib/config';
import { fetchMonthlyAdvice, FriendlyError, NotConfiguredError } from '../lib/api';
import {
  addMonths, basicAdvice, compareMonths, comparisonText, durationLabel, firstMonth, MINUTES_SAVED_PER_POST, MINUTES_SAVED_PER_STORY,
  monthKey, monthLabel, monthName, monthOf, ofMonth, summarize, type Month,
} from '../lib/report';
import { bestPost, formatCount, reachOf, statsLine, sumOf, totalOf, type StatsMap } from '../lib/stats';

type AdviceState =
  | { kind: 'loading' }
  | { kind: 'ready'; text: string; basic: boolean }
  | { kind: 'error'; message: string }
  | { kind: 'none' };

/** « Mon bilan » : les vrais chiffres du mois, la comparaison avec le mois d'avant et un conseil. */
export function Report({ initialMonth }: { initialMonth?: Month }) {
  const { business, posts, back, go, stats, refreshStats, connections } = useApp();
  useEffect(() => { refreshStats(); }, [refreshStats]);
  const connected = connections.some((c) => c.status === 'connected');
  const b = business!;
  const current = monthOf(new Date());
  const oldest = firstMonth(posts);
  const [month, setMonth] = useState<Month>(initialMonth ?? current);
  const s = useMemo(() => summarize(posts, month), [posts, month]);
  // Vrais chiffres Instagram + Facebook (null = pas encore connu, jamais estimé).
  const reachPosts = useMemo(() => reachOf(s.posts, stats), [s.posts, stats]);
  const reachStories = useMemo(() => reachOf(s.stories, stats), [s.stories, stats]);
  const reachTotal = reachPosts === null && reachStories === null ? null : (reachPosts ?? 0) + (reachStories ?? 0);
  const best = useMemo(() => bestPost(s.posts, stats), [s.posts, stats]);
  const monthPosts = useMemo(() => [...s.posts, ...s.stories], [s.posts, s.stories]);
  const likes = useMemo(() => sumOf(monthPosts, stats, 'likes'), [monthPosts, stats]);
  const comments = useMemo(() => sumOf(monthPosts, stats, 'comments'), [monthPosts, stats]);
  const canGoBack = compareMonths(month, oldest) > 0;
  const canGoNext = compareMonths(month, current) < 0;

  // Le conseil porte sur le mois qui suit. On ne le donne que pour le mois en cours ou celui qui vient de finir.
  const adviceFor = addMonths(month, 1);
  const showAdvice = compareMonths(month, addMonths(current, -1)) >= 0;
  const nextOccasions = useMemo(() => {
    // Les occasions à venir du mois suivant (pas celles déjà passées).
    const start = new Date(Math.max(new Date(adviceFor.year, adviceFor.month, 1).getTime(), Date.now()));
    return upcomingEvents(b, start, 1, b.postalCode).filter((e) => e.date.getMonth() === adviceFor.month).slice(0, 4);
  }, [b, adviceFor.year, adviceFor.month]);

  const [advice, setAdvice] = useState<AdviceState>({ kind: 'loading' });
  const loadAdvice = useCallback(async () => {
    if (!showAdvice) return setAdvice({ kind: 'none' });
    const basic = () => setAdvice({ kind: 'ready', basic: true, text: basicAdvice(s, nextOccasions[0] ?? null) });
    if (!isBackendConfigured) return basic();
    setAdvice({ kind: 'loading' });
    try {
      const text = await fetchMonthlyAdvice({
        month: monthKey(s.month), count: s.count, previousCount: s.previousCount, inProgress: s.inProgress, daysLeft: s.daysLeft,
        occasions: nextOccasions, tradeHint: tradeById(b.businessType)?.aiHint,
      });
      setAdvice({ kind: 'ready', text, basic: false });
    } catch (e) {
      if (e instanceof NotConfiguredError) basic();
      else setAdvice({ kind: 'error', message: e instanceof FriendlyError ? e.message : "Le conseil n'a pas pu être chargé. Réessayez." });
    }
  }, [showAdvice, s, nextOccasions, b.businessType]);
  useEffect(() => { loadAdvice(); }, [loadAdvice]);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <BackButton onPress={back} />
        <Title size={24} style={{ flex: 1 }}>Mon bilan</Title>
        <ChartUpIcon size={26} color={colors.green} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <MonthArrow label="‹" a11y="Mois précédent" enabled={canGoBack} onPress={() => setMonth(addMonths(month, -1))} />
        <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontFamily: fonts.title, fontSize: 22, fontWeight: '600', color: colors.text, textTransform: 'capitalize' }}>{monthLabel(month)}</Text>
          {s.inProgress && <Badge text="Mois en cours" tone="green" />}
        </View>
        <MonthArrow label="›" a11y="Mois suivant" enabled={canGoNext} onPress={() => setMonth(addMonths(month, 1))} />
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Tile icon={<CameraIcon size={22} color={colors.green} />} value={String(s.count)} label={s.count > 1 ? 'posts publiés' : 'post publié'} />
        <Tile icon={<StoryIcon size={22} color={colors.green} />} value={String(s.storyCount)} label={s.storyCount > 1 ? 'stories publiées' : 'story publiée'} />
      </View>
      {/* Les réactions des clients : très parlant pour le commerçant, donc juste sous le nombre de posts. */}
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Title size={20}>Vos clients ont aimé</Title>
          <Body soft size={15}>Sur vos posts et stories {ofMonth(month)}, Instagram et Facebook réunis</Body>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Reaction icon={<HeartIcon size={30} color={colors.orangeText} fill={colors.orange} />} value={likes} label="j'aime" connected={connected} />
          <Reaction icon={<MessageIcon size={30} color={colors.orangeText} />} value={comments} label={comments !== null && comments > 1 ? 'commentaires' : 'commentaire'} connected={connected} />
        </View>
      </Card>

      {best ? (
        <Card onPress={() => go({ name: 'published', postId: best.post.id })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <PostThumb post={best.post} width={64} height={64} />
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <StarIcon size={18} color={colors.orangeText} />
                <Body style={{ fontWeight: '700' }} size={16}>Votre meilleur post</Body>
              </View>
              <Text style={{ color: colors.orangeStrong, fontSize: 15, fontWeight: '700', fontFamily: fonts.body }}>{statsLine(best.stats)}</Text>
            </View>
          </View>
        </Card>
      ) : (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <IconTile size={48} tone="orange"><StarIcon size={24} color={colors.orangeText} /></IconTile>
            <View style={{ flex: 1, gap: 2 }}>
              <Body style={{ fontWeight: '700' }} size={16}>Votre meilleur post</Body>
              <Body soft size={15}>{connected ? 'Pas encore de réactions sur vos posts de ce mois.' : 'Connectez Instagram et Facebook pour savoir quel post vos clients préfèrent.'}</Body>
            </View>
          </View>
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconTile size={48}><ClockIcon size={24} color={colors.green} /></IconTile>
          <View style={{ flex: 1, gap: 2 }}>
            <Body style={{ fontWeight: '700' }} size={16}>{durationLabel(s.minutesSaved)} de temps gagné</Body>
            <Body soft size={15}>environ {MINUTES_SAVED_PER_POST} min par post, {MINUTES_SAVED_PER_STORY} min par story</Body>
          </View>
        </View>
      </Card>

      {/* Le chiffre qui fait plaisir : tous les clients touchés, posts et stories réunis. Jamais estimé. */}
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconTile size={48} tone="orange"><EyeIcon size={26} color={colors.orangeText} /></IconTile>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '700', fontFamily: fonts.body }}>Clients touchés</Text>
            <Body soft size={15}>Toutes les personnes qui ont vu vos posts et vos stories {ofMonth(month)}.</Body>
          </View>
          {reachTotal !== null ? <Title size={30}>{formatCount(reachTotal)}</Title> : <Badge text={connected ? '—' : 'Bientôt'} tone="orange" />}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <ViewsPart icon={<CameraIcon size={18} color={colors.green} />} label="Posts" value={reachPosts} connected={connected} />
          <ViewsPart icon={<StoryIcon size={18} color={colors.green} />} label="Stories" value={reachStories} connected={connected} />
        </View>
        <Body soft size={15}>{connected
          ? 'Chiffres donnés par Instagram et Facebook (personnes différentes, réseau par réseau). Mis à jour toutes les 30 minutes.'
          : 'Les vrais chiffres arriveront dès qu\'Instagram et Facebook seront connectés.'}</Body>
      </Card>

      {s.posts.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label>Vos posts {ofMonth(month)}</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {s.posts.map((p) => (
              <Pressable key={p.id} onPress={() => go({ name: 'published', postId: p.id })} accessibilityRole="button" accessibilityLabel={`Voir le post du ${new Date(p.publishedAt ?? p.createdAt).toLocaleDateString('fr-FR')}`}>
                <PostThumb post={p} width={84} height={84} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
      {s.count === 0 && (
        <Body soft center>{s.inProgress ? "Pas encore de post publié ce mois-ci. Une photo suffit pour commencer !" : `Aucun post publié en ${monthName(month)}.`}</Body>
      )}

      <View style={{ gap: 10 }}>
        <Label>Vos stories {ofMonth(month)}</Label>
        {s.stories.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 2 }}>
            {s.stories.map((p) => <StoryRing key={p.id} post={p} stats={stats} onPress={() => go({ name: 'published', postId: p.id })} />)}
          </ScrollView>
        ) : (
          <Card style={{ gap: 10, alignItems: 'center' }}>
            <Body soft center>{s.inProgress ? 'Pas encore de story ce mois-ci. Une photo ou une petite vidéo suffit.' : `Aucune story publiée en ${monthName(month)}.`}</Body>
            {s.inProgress && <Button title="Faire une story" kind="secondary" icon={<StoryIcon size={20} color={colors.green} />} onPress={() => go({ name: 'story' })} />}
          </Card>
        )}
      </View>

      <Card style={{ gap: 8 }}>
        <Label>Par rapport à {monthName(s.previous)}</Label>
        <Body>{comparisonText(s)}</Body>
      </Card>

      {advice.kind !== 'none' && (
        <View style={{ backgroundColor: 'rgba(220,239,227,0.8)', borderWidth: 1, borderColor: glass.edge, borderRadius: radius.lg - 2, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <BulbIcon size={20} color={colors.green} />
          <Text style={{ color: colors.green, fontWeight: '700', fontSize: 15, fontFamily: fonts.body, flex: 1 }}>
            {s.trend === 'down' ? 'Un petit coup de pouce' : 'Mon conseil'} pour {monthName(adviceFor)}
          </Text>
          </View>
          {advice.kind === 'loading' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ActivityIndicator color={colors.green} />
              <Body soft>Vitrine prépare votre conseil...</Body>
            </View>
          )}
          {advice.kind === 'ready' && (
            <>
              <Body size={17}>{advice.text}</Body>
              {advice.basic && <Body soft size={15}>Conseil de base : l'IA n'est pas encore branchée.</Body>}
            </>
          )}
          {advice.kind === 'error' && (
            <View style={{ gap: 10 }}>
              <Notice tone="red" title="Nous avons besoin de votre attention" text={advice.message} />
              <Button title="Réessayer" kind="secondary" icon={<RefreshIcon size={20} color={colors.green} />} onPress={loadAdvice} />
            </View>
          )}
        </View>
      )}

      <Body soft size={15} center>Ces chiffres viennent de vos vrais posts et stories publiés avec Vitrine. Le temps gagné est une estimation.</Body>
      <ReferralAsk monthKey={monthKey(month)} eligible={!s.inProgress && s.count > 0 && compareMonths(month, addMonths(current, -1)) === 0} onSend={() => go({ name: 'referral' })} />
    </ScrollView>
  );
}

function Tile({ icon, tone, value, label, hint, soon }: { icon: React.ReactNode; tone?: 'green' | 'orange'; value?: string; label: string; hint?: string; soon?: boolean }) {
  return (
    <Card style={{ flex: 1, gap: 6, minHeight: 150 }}>
      <IconTile size={42} tone={tone}>{icon}</IconTile>
      {soon ? <View style={{ alignSelf: 'flex-start' }}><Badge text="Bientôt" tone="orange" /></View> : <Title size={30}>{value}</Title>}
      <Body style={{ fontWeight: '700' }} size={15}>{label}</Body>
      {hint ? <Body soft size={15}>{hint}</Body> : null}
    </Card>
  );
}

function MonthArrow({ label, a11y, enabled, onPress }: { label: string; a11y: string; enabled: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!enabled} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled: !enabled }}
      style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: enabled ? colors.green : glass.line, backgroundColor: glass.bgStrong, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : 0.4 }}>
      <Text style={{ color: enabled ? colors.green : colors.textSoft, fontSize: 26, fontWeight: '700', lineHeight: 28 }}>{label}</Text>
    </Pressable>
  );
}

/** Un total de réactions du mois (j'aime ou commentaires), en orange. */
function Reaction({ icon, value, label, connected }: { icon: React.ReactNode; value: number | null; label: string; connected: boolean }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.orangeSoft, borderRadius: radius.sm + 2, padding: 12 }}>
      {icon}
      <View style={{ flex: 1 }}>
        {value !== null
          ? <Title size={28} style={{ color: colors.orangeText }}>{formatCount(value)}</Title>
          : <Text style={{ color: colors.orangeText, fontSize: 22, fontWeight: '700', fontFamily: fonts.body }}>{connected ? '—' : 'Bientôt'}</Text>}
        <Text style={{ color: colors.orangeText, fontSize: 15, fontWeight: '600', fontFamily: fonts.body }}>{label}</Text>
      </View>
    </View>
  );
}

/** Une part des « clients touchés » : posts ou stories. */
function ViewsPart({ icon, label, value, connected }: { icon: React.ReactNode; label: string; value: number | null; connected: boolean }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: glass.bgStrong, borderRadius: radius.sm + 2, borderWidth: 1, borderColor: glass.line, padding: 10 }}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', fontFamily: fonts.body }}>{label}</Text>
        {value !== null
          ? <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', fontFamily: fonts.body }}>{formatCount(value)}</Text>
          : <Text style={{ color: colors.orangeText, fontSize: 14, fontFamily: fonts.body }}>{connected ? 'pas encore de chiffre' : 'bientôt'}</Text>}
      </View>
    </View>
  );
}

/** Une story du mois, en rond comme sur Instagram, avec ses vues en dessous. */
function StoryRing({ post, stats, onPress }: { post: Post; stats: StatsMap; onPress: () => void }) {
  const day = new Date(post.publishedAt ?? post.createdAt);
  const views = totalOf(stats[post.id]).views;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Voir la story du ${day.toLocaleDateString('fr-FR')}`} style={{ alignItems: 'center', gap: 6, width: 76 }}>
      <View style={{ ...greenGradient, width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, borderColor: colors.white, overflow: 'hidden', backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
          {post.imageUri ? <Image source={{ uri: post.imageUri }} style={{ width: 64, height: 64 }} /> : <VideoIcon size={24} color={colors.green} />}
        </View>
      </View>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', fontFamily: fonts.body }}>{day.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <EyeIcon size={14} color={colors.orangeText} />
        <Text style={{ color: views !== null ? colors.text : colors.orangeText, fontSize: 12, fontFamily: fonts.body }}>{views !== null ? `${formatCount(views)} vues` : '—'}</Text>
      </View>
    </Pressable>
  );
}
