import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { Badge, Body, Button, Card, IconTile, Label, Notice, PostThumb, Title, BackButton } from '../components/ui';
import { ReferralAsk } from '../components/ReferralAsk';
import { BulbIcon, CameraIcon, ChartUpIcon, ClockIcon, EyeIcon, HeartIcon, MessageIcon, RefreshIcon, StarIcon, VideoIcon } from '../components/icons';
import { colors, fonts, glass, greenGradient, radius } from '../lib/theme';
import type { Post } from '../lib/types';
import { useApp } from '../lib/store';
import { upcomingEvents } from '../lib/events';
import { tradeById } from '../lib/trades';
import { isBackendConfigured } from '../lib/config';
import { fetchMonthlyAdvice, FriendlyError, NotConfiguredError } from '../lib/api';
import {
  addMonths, basicAdvice, compareMonths, comparisonText, durationLabel, firstMonth,
  monthKey, monthLabel, monthName, monthOf, ofMonth, summarize, type Month,
} from '../lib/report';
import { bestPost, formatCount, statsLine, sumOf, totalOf, viewsOf, type StatsMap } from '../lib/stats';
import { isStoreApp } from '../lib/native';

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
  // « Clients touchés » = toutes les vues du mois, Instagram et Facebook réunis (choix de Kelian, 11 nov.).
  const viewsPosts = useMemo(() => viewsOf(s.posts, stats), [s.posts, stats]);
  const viewsStories = useMemo(() => viewsOf(s.stories, stats), [s.stories, stats]);
  const viewsTotal = viewsPosts === null && viewsStories === null ? null : (viewsPosts ?? 0) + (viewsStories ?? 0);
  const best = useMemo(() => bestPost(s.posts, stats), [s.posts, stats]);
  const monthPosts = useMemo(() => [...s.posts, ...s.stories], [s.posts, s.stories]);
  const likes = useMemo(() => sumOf(monthPosts, stats, 'likes'), [monthPosts, stats]);
  const comments = useMemo(() => sumOf(monthPosts, stats, 'comments'), [monthPosts, stats]);
  // Nouveau client : rien encore publié avec Vitrine. Plutôt que des zéros et des « Bientôt », on explique ce qui arrive.
  const firstTime = !posts.some((p) => p.status === 'published' || p.status === 'partially_published');
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

      {firstTime ? <FirstReport onPublish={() => go({ name: 'home' })} connected={connected} onConnect={() => go({ name: 'settings' })} /> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <MonthArrow label="‹" a11y="Mois précédent" enabled={canGoBack} onPress={() => setMonth(addMonths(month, -1))} />
        <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <Text style={{ fontFamily: fonts.title, fontSize: 22, fontWeight: '600', color: colors.text, textTransform: 'capitalize' }}>{monthLabel(month)}</Text>
          {s.inProgress && <Badge text="Mois en cours" tone="green" />}
        </View>
        <MonthArrow label="›" a11y="Mois suivant" enabled={canGoNext} onPress={() => setMonth(addMonths(month, 1))} />
      </View>

      {/* 1. Le chiffre qui compte le plus pour le commerçant (choix de Kelian) : combien de clients l'ont vu. Jamais estimé. */}
      <View style={{ ...greenGradient, borderRadius: radius.lg, padding: 20, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <EyeIcon size={26} color={colors.white} />
          <Text style={{ color: colors.white, fontSize: 20, fontWeight: '700', fontFamily: fonts.body, flex: 1 }}>Clients touchés</Text>
        </View>
        {viewsTotal !== null ? (
          <>
            <View>
              <Text style={{ color: colors.white, fontSize: 52, lineHeight: 58, fontWeight: '700', fontFamily: fonts.title }}>{formatCount(viewsTotal)}</Text>
              <Text style={{ color: colors.white, fontSize: 17, fontFamily: fonts.body, opacity: 0.92 }}>
                {viewsTotal > 1 ? 'vues' : 'vue'} de vos publications {ofMonth(month)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <HeroPart label="Posts" value={viewsPosts} />
              <HeroPart label="Stories" value={viewsStories} />
            </View>
          </>
        ) : (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.white, fontSize: 17, fontFamily: fonts.body }}>
              {connected ? 'Instagram et Facebook n\'ont pas encore donné de chiffre pour ce mois.' : 'Connectez Instagram et Facebook pour voir combien de clients voient vos publications.'}
            </Text>
            {!connected && <Button title="Connecter mes réseaux" kind="secondary" onPress={() => go({ name: 'settings' })} />}
          </View>
        )}
      </View>

      {/* 2. Ce que Vitrine a fait ce mois-ci, en trois chiffres. */}
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          <MiniStat value={String(s.count)} label={s.count > 1 ? 'posts' : 'post'} />
          <MiniStat value={String(s.storyCount)} label={s.storyCount > 1 ? 'stories' : 'story'} divider />
          <MiniStat value={durationLabel(s.minutesSaved)} label="gagnées" divider />
        </View>
        <Body soft size={15} center>{comparisonText(s)}</Body>
      </Card>

      {/* 3. Les réactions des clients et le post qu'ils ont préféré, dans la même carte. */}
      <Card style={{ gap: 12 }}>
        <Title size={20}>Vos clients ont aimé</Title>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Reaction icon={<HeartIcon size={26} color={colors.orangeText} fill={colors.orange} />} value={likes} label="j'aime" connected={connected} />
          <Reaction icon={<MessageIcon size={26} color={colors.orangeText} />} value={comments} label={comments !== null && comments > 1 ? 'commentaires' : 'commentaire'} connected={connected} />
        </View>
        {best && (
          <Pressable onPress={() => go({ name: 'published', postId: best.post.id })} accessibilityRole="button" accessibilityLabel="Voir votre meilleur post"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: glass.line, paddingTop: 12 }}>
            <PostThumb post={best.post} width={56} height={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <StarIcon size={18} color={colors.orangeText} />
                <Body style={{ fontWeight: '700' }} size={16}>Votre meilleur post</Body>
              </View>
              <Text style={{ color: colors.orangeStrong, fontSize: 15, fontWeight: '700', fontFamily: fonts.body }}>{statsLine(best.stats)}</Text>
            </View>
            <Text style={{ color: colors.textSoft, fontSize: 24 }}>›</Text>
          </Pressable>
        )}
      </Card>

      {/* 4. Les publications du mois, posts et stories dans une seule ligne. */}
      {s.posts.length + s.stories.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Label>Vos publications {ofMonth(month)}</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 2, alignItems: 'flex-start' }}>
            {[...s.posts, ...s.stories].sort((a, b) => (a.publishedAt ?? a.createdAt).localeCompare(b.publishedAt ?? b.createdAt)).map((p) => (
              <Publication key={p.id} post={p} stats={stats} onPress={() => go({ name: 'published', postId: p.id })} />
            ))}
          </ScrollView>
        </View>
      ) : (
        <Card style={{ gap: 10, alignItems: 'center' }}>
          <Body soft center>{s.inProgress ? 'Pas encore de publication ce mois-ci. Une photo suffit pour commencer.' : `Aucune publication en ${monthName(month)}.`}</Body>
          {s.inProgress && <Button title="Publier une photo" kind="secondary" icon={<CameraIcon size={20} color={colors.green} />} onPress={() => go({ name: 'home' })} />}
        </Card>
      )}

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
      </>}
      {!firstTime && !isStoreApp && <ReferralAsk monthKey={monthKey(month)} eligible={!s.inProgress && s.count > 0 && compareMonths(month, addMonths(current, -1)) === 0} onSend={() => go({ name: 'referral' })} />}
    </ScrollView>
  );
}

/** Bilan d'un nouveau client : ce qu'il verra ici dès son premier post, sans chiffres vides. */
function FirstReport({ onPublish, connected, onConnect }: { onPublish: () => void; connected: boolean; onConnect: () => void }) {
  const items: [React.ReactNode, string, string][] = [
    [<EyeIcon key="e" size={22} color={colors.orangeText} />, 'Les clients touchés', 'Combien de personnes ont vu vos publications.'],
    [<CameraIcon key="c" size={22} color={colors.green} />, 'Vos posts et stories du mois', 'Tout ce que vous avez publié, en un coup d\'œil.'],
    [<HeartIcon key="h" size={22} color={colors.orangeText} fill={colors.orange} />, 'Ce que vos clients ont aimé', 'Les j\'aime, les commentaires et votre meilleur post.'],
    [<ClockIcon key="t" size={22} color={colors.green} />, 'Le temps gagné', 'Et un conseil pour le mois suivant.'],
  ];
  return (
    <>
      <Card style={{ gap: 14, alignItems: 'center', paddingVertical: 24 }}>
        <IconTile size={64}><ChartUpIcon size={32} color={colors.green} /></IconTile>
        <Title size={24} style={{ textAlign: 'center' }}>Votre bilan arrive bientôt</Title>
        <Body soft center>Dès votre premier post, vous verrez ici ce que Vitrine fait pour votre boutique.</Body>
        {connected
          ? <Button title="Publier ma première photo" onPress={onPublish} style={{ alignSelf: 'stretch' }} />
          : <Button title="Connecter mes réseaux" onPress={onConnect} style={{ alignSelf: 'stretch' }} />}
      </Card>
      <Label>Ce que vous trouverez ici</Label>
      <Card style={{ gap: 14 }}>
        {items.map(([icon, title, text]) => (
          <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <IconTile size={44} tone="green">{icon}</IconTile>
            <View style={{ flex: 1 }}>
              <Body style={{ fontWeight: '700' }} size={16}>{title}</Body>
              <Body soft size={15}>{text}</Body>
            </View>
          </View>
        ))}
      </Card>
    </>
  );
}

/** Un chiffre du mois (posts, stories, temps gagné), côte à côte sur une ligne. */
function MiniStat({ value, label, divider }: { value: string; label: string; divider?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2, borderLeftWidth: divider ? 1 : 0, borderLeftColor: glass.line }}>
      <Title size={26}>{value}</Title>
      <Body soft size={15}>{label}</Body>
    </View>
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
    <View style={{ flex: 1, gap: 6, backgroundColor: colors.orangeSoft, borderRadius: radius.sm + 2, padding: 12 }}>
      {icon}
      <View>
        {value !== null
          ? <Title size={28} style={{ color: colors.orangeText }}>{formatCount(value)}</Title>
          : <Text style={{ color: colors.orangeText, fontSize: 22, fontWeight: '700', fontFamily: fonts.body }}>{connected ? '—' : 'Bientôt'}</Text>}
        <Text style={{ color: colors.orangeText, fontSize: 15, fontWeight: '600', fontFamily: fonts.body }}>{label}</Text>
      </View>
    </View>
  );
}

/** Une part des « clients touchés » (posts ou stories), sur le fond vert. */
function HeroPart({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radius.sm + 2, paddingVertical: 10, paddingHorizontal: 12 }}>
      <Text style={{ color: colors.white, fontSize: 15, fontFamily: fonts.body, opacity: 0.9 }}>{label}</Text>
      <Text style={{ color: colors.white, fontSize: 19, fontWeight: '700', fontFamily: fonts.body }}>{value !== null ? formatCount(value) : '—'}</Text>
    </View>
  );
}

/** Une publication du mois (post en carré, story en rond comme sur Instagram), avec sa date et ses vues. */
function Publication({ post, stats, onPress }: { post: Post; stats: StatsMap; onPress: () => void }) {
  const day = new Date(post.publishedAt ?? post.createdAt);
  const views = totalOf(stats[post.id]).views;
  const story = post.kind === 'story';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Voir ${story ? 'la story' : 'le post'} du ${day.toLocaleDateString('fr-FR')}`} style={{ alignItems: 'center', gap: 6, width: 76 }}>
      {story ? (
        <View style={{ ...greenGradient, width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 2.5, borderColor: colors.white, overflow: 'hidden', backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
            {post.imageUri ? <Image source={{ uri: post.imageUri }} style={{ width: 64, height: 64 }} /> : <VideoIcon size={24} color={colors.green} />}
          </View>
        </View>
      ) : <PostThumb post={post} width={72} height={72} />}
      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', fontFamily: fonts.body }}>{day.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <EyeIcon size={14} color={colors.orangeText} />
        <Text style={{ color: views !== null ? colors.text : colors.orangeText, fontSize: 14, fontFamily: fonts.body }}>{views !== null ? formatCount(views) : '—'}</Text>
      </View>
    </Pressable>
  );
}
